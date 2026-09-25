import { getDatabaseSnapshot, replaceDatabaseSnapshot } from './database';
import type { DatabaseSnapshot, StoreName } from './database';

const BACKUP_NAME = 'agora-backup-v1.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3';

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }) => { requestAccessToken: () => void } } } };
  }
}

type DriveFile = { id: string; name: string; mimeType?: string };
type Manifest = { format: 'agora-drive-backup'; version: 1; savedAt: string; stores: Record<StoreName, Array<Record<string, unknown> & { id: string }>>; sheets: Record<string, { fileId: string; type: string }> };
let accessToken = '';

function clientId() { return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''; }
function loadIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    const script = existing ?? document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.googleIdentity = 'true';
    script.onload = () => resolve(); script.onerror = () => reject(new Error('No se pudo cargar el acceso seguro de Google. Comprueba la conexión a Internet.'));
    if (!existing) document.head.append(script);
  });
}

async function authorize(): Promise<string> {
  if (!clientId()) throw new Error('Falta configurar el acceso de Google para Ágora. Consulta los pasos de configuración al final de esta conversación.');
  await loadIdentityServices();
  if (!window.google?.accounts?.oauth2) throw new Error('Google no ha iniciado el acceso. Vuelve a intentarlo.');
  accessToken = await new Promise<string>((resolve, reject) => {
    const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({ client_id: clientId(), scope: SCOPE, callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error ?? 'Google no autorizó el acceso a la carpeta privada de Ágora.')) });
    tokenClient.requestAccessToken();
  });
  return accessToken;
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...init.headers } });
  if (!response.ok) {
    let detail = ''; try { detail = (await response.json()).error?.message ?? ''; } catch { /* Response may have no JSON body. */ }
    if (response.status === 401) accessToken = '';
    throw new Error(detail || `Google Drive devolvió el error ${response.status}.`);
  }
  return response;
}

async function driveUploadFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...init.headers } });
  if (!response.ok) {
    let detail = ''; try { detail = (await response.json()).error?.message ?? ''; } catch { /* Response may have no JSON body. */ }
    throw new Error(detail || `Google Drive devolvió el error ${response.status}.`);
  }
  return response;
}

async function findFile(name: string): Promise<DriveFile | undefined> {
  const query = new URLSearchParams({ q: `name = '${name.replaceAll("'", "\\'")}' and 'appDataFolder' in parents and trashed = false`, spaces: 'appDataFolder', fields: 'files(id,name,mimeType)', pageSize: '10' });
  const result = await (await driveFetch(`/files?${query}`)).json() as { files?: DriveFile[] };
  return result.files?.[0];
}

async function upload(name: string, blob: Blob, mimeType: string): Promise<string> {
  const current = await findFile(name);
  const path = current ? `/files/${encodeURIComponent(current.id)}?uploadType=resumable` : '/files?uploadType=resumable&fields=id';
  const response = await driveUploadFetch(path, {
    method: current ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(current ? { name, mimeType } : { name, mimeType, parents: ['appDataFolder'] }),
  });
  const sessionUrl = response.headers.get('Location');
  if (!sessionUrl) throw new Error('Google Drive no inició la subida segura del archivo.');
  const uploaded = await fetch(sessionUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mimeType }, body: blob });
  if (!uploaded.ok) throw new Error(`No se pudo subir «${name}» a Google Drive (error ${uploaded.status}).`);
  const metadata = await uploaded.json() as { id: string };
  return metadata.id ?? current?.id ?? '';
}

async function download(fileId: string): Promise<Blob> {
  return (await driveFetch(`/files/${encodeURIComponent(fileId)}?alt=media`)).blob();
}

function isRecordList(value: unknown): value is Array<Record<string, unknown> & { id: string }> {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string');
}

function validManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Manifest>;
  return item.format === 'agora-drive-backup' && item.version === 1 && !!item.stores && ['questions', 'collections', 'attempts', 'settings', 'importBatches', 'psychSheets'].every((name) => isRecordList(item.stores?.[name as StoreName])) && !!item.sheets && typeof item.sheets === 'object';
}

export async function saveBackupToDrive(): Promise<string> {
  await authorize();
  const snapshot = await getDatabaseSnapshot();
  const sheets: Manifest['sheets'] = {};
  const portableStores = { ...snapshot, psychSheets: snapshot.psychSheets.map((sheet) => {
    const image = sheet.image;
    if (!(image instanceof Blob)) throw new Error(`No se pudo preparar la lámina «${String(sheet.name ?? '')}» para la copia.`);
    return { ...sheet, image: undefined };
  }) };
  for (const sheet of snapshot.psychSheets) {
    const image = sheet.image;
    if (!(image instanceof Blob)) continue;
    const fileId = await upload(`agora-sheet-${sheet.id}`, image, image.type || 'application/octet-stream');
    sheets[sheet.id] = { fileId, type: image.type || 'application/octet-stream' };
  }
  const manifest: Manifest = { format: 'agora-drive-backup', version: 1, savedAt: new Date().toISOString(), stores: portableStores, sheets };
  const fileId = await upload(BACKUP_NAME, new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'application/json');
  return fileId;
}

export async function restoreBackupFromDrive(): Promise<string> {
  await authorize();
  const file = await findFile(BACKUP_NAME);
  if (!file) throw new Error('Aún no hay una copia de Ágora en tu Google Drive privado.');
  const parsed: unknown = JSON.parse(await (await driveFetch(`/files/${encodeURIComponent(file.id)}?alt=media`)).text());
  if (!validManifest(parsed)) throw new Error('La copia guardada en Drive no tiene un formato válido.');
  const sheets = await Promise.all(parsed.stores.psychSheets.map(async (sheet) => {
    const reference = parsed.sheets[sheet.id];
    if (!reference) throw new Error(`Falta el archivo de la lámina «${String(sheet.name ?? '')}» en la copia de Drive.`);
    return { ...sheet, image: await download(reference.fileId) };
  }));
  const snapshot = { ...parsed.stores, psychSheets: sheets } as DatabaseSnapshot;
  await replaceDatabaseSnapshot(snapshot);
  return parsed.savedAt;
}
