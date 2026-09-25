export const DATABASE_NAME = 'agora-estudio';
export const DATABASE_VERSION = 3;
export const STORE_NAMES = ['questions', 'collections', 'attempts', 'settings', 'importBatches', 'psychSheets'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export type Block = 'teoria' | 'psicotecnicos' | 'personalidad';
export type PsychCategory = 'espacial' | 'abstracto' | 'percepcion' | 'verbal';
export interface Question {
  id: string; block: Block; category?: PsychCategory; topic?: number; collectionId?: string;
  prompt: string; options: string[]; correctIndex?: number; responseScale?: 4 | 7; referenceAnswer?: number;
  source: string; sourceReference?: string; createdAt: string;
}
export interface Collection { id: string; block: Block; kind: 'exam' | 'personality'; title: string; source: string; questionOrder: string[] }
export interface AttemptAnswer { question: Question; selectedIndex: number | null; correct?: boolean }
export interface Attempt {
  id: string; mode: 'personalizado' | 'simulacro' | 'examen' | 'falladas' | 'practica' | 'personalidad';
  title: string; startedAt: string; finishedAt: string; durationSeconds: number; score: number;
  answers: AttemptAnswer[]; total: number;
}
export interface SimulatorConfig { block: Block; category?: PsychCategory; topics: number[]; questionCount: number; timeMinutes: number }
export interface AppSettings { id: 'app'; schemaVersion: number; simulator?: SimulatorConfig }
export interface DrawingStroke { tool: 'pen' | 'eraser'; color: string; width: number; points: Array<{ x: number; y: number }> }
export interface PsychSheet { id: string; name: string; category: PsychCategory; image: Blob; format?: 'image' | 'pdf'; pageCount?: number; strokes: DrawingStroke[]; pageStrokes?: Record<string, DrawingStroke[]>; createdAt: string }

let databasePromise: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Este navegador no permite almacenamiento local.'));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const storeName of STORE_NAMES) if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas de Ágora para actualizar el almacenamiento.'));
  });
}
function db() { if (!databasePromise) databasePromise = openDatabase().catch((error) => { databasePromise = undefined; throw error; }); return databasePromise; }

export async function getRecord<T>(store: StoreName, id: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => { const request = database.transaction(store).objectStore(store).get(id); request.onsuccess = () => resolve(request.result as T | undefined); request.onerror = () => reject(request.error); });
}
export async function getAll<T>(store: StoreName): Promise<T[]> {
  const database = await db();
  return new Promise((resolve, reject) => { const request = database.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error); });
}
export async function saveMany<T extends { id: string }>(store: StoreName, records: T[]): Promise<void> {
  if (!records.length) return;
  const database = await db();
  return new Promise((resolve, reject) => { const transaction = database.transaction(store, 'readwrite'); for (const record of records) transaction.objectStore(store).put({ ...record, updatedAt: new Date().toISOString() }); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
}
export async function saveRecord<T extends { id: string }>(store: StoreName, record: T): Promise<void> { return saveMany(store, [record]); }
export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  const database = await db(); return new Promise((resolve, reject) => { const transaction = database.transaction(store, 'readwrite'); transaction.objectStore(store).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
}
export async function clearStore(store: StoreName): Promise<void> {
  const database = await db(); return new Promise((resolve, reject) => { const transaction = database.transaction(store, 'readwrite'); transaction.objectStore(store).clear(); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
}
export async function initializeStorage(): Promise<AppSettings> {
  const settings = await getRecord<AppSettings>('settings', 'app');
  if (settings) return settings;
  const initial: AppSettings = { id: 'app', schemaVersion: DATABASE_VERSION };
  await saveRecord('settings', initial); return initial;
}

export async function replaceAllData(data: { questions: Question[]; collections: Collection[]; attempts: Attempt[]; settings: AppSettings }): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['questions', 'collections', 'attempts', 'settings'], 'readwrite');
    for (const name of ['questions', 'collections', 'attempts', 'settings'] as const) transaction.objectStore(name).clear();
    for (const item of data.questions) transaction.objectStore('questions').put(item);
    for (const item of data.collections) transaction.objectStore('collections').put(item);
    for (const item of data.attempts) transaction.objectStore('attempts').put(item);
    transaction.objectStore('settings').put(data.settings);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}

export type DatabaseSnapshot = { [K in StoreName]: Array<Record<string, unknown> & { id: string }> };

export async function getDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const entries = await Promise.all(STORE_NAMES.map(async (name) => [name, await getAll<Record<string, unknown> & { id: string }>(name)] as const));
  return Object.fromEntries(entries) as DatabaseSnapshot;
}

export async function replaceDatabaseSnapshot(snapshot: DatabaseSnapshot): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([...STORE_NAMES], 'readwrite');
    for (const name of STORE_NAMES) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const item of snapshot[name]) store.put(item);
    }
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}
