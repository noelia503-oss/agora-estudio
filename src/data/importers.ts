import type { Block, PsychCategory, Question } from './database';

export interface QuestionDraft {
  id: string; prompt: string; options: string[]; correctIndex: number | null; responseScale?: 4 | 7; referenceAnswer?: number;
  block: Block; category?: PsychCategory; topic?: number; collection?: string; source: string; sourceReference: string; error?: string;
}
const id = () => crypto.randomUUID();
const cell = (value: unknown) => value == null ? '' : String(value);
const headers = ['enunciado', 'opcion_a', 'opcion_b', 'opcion_c', 'opcion_d', 'correcta', 'bloque', 'tema', 'categoria', 'coleccion'];
function draft(row: Record<string, unknown>, source: string, rowNumber: number): QuestionDraft {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) normalized[key.toLowerCase().trim().replaceAll(' ', '_')] = value;
  const prompt = cell(normalized.enunciado ?? normalized.pregunta ?? normalized.question);
  const options = [cell(normalized.opcion_a ?? normalized.a), cell(normalized.opcion_b ?? normalized.b), cell(normalized.opcion_c ?? normalized.c), cell(normalized.opcion_d ?? normalized.d)] as QuestionDraft['options'];
  const rawKey = cell(normalized.correcta ?? normalized.respuesta_correcta ?? normalized.correct_index).trim().toLowerCase();
  const correctIndex = /^[1-4]$/.test(rawKey) ? Number(rawKey) - 1 : ['a', 'b', 'c', 'd'].indexOf(rawKey.replace(/[()+]/g, '').replace(/^opcion_/, ''));
  const rawBlock = cell(normalized.bloque ?? normalized.block).trim().toLowerCase();
  const block: Block = rawBlock.includes('psico') ? 'psicotecnicos' : rawBlock.includes('person') ? 'personalidad' : 'teoria';
  const rawCategory = cell(normalized.categoria ?? normalized.category).toLowerCase();
  const category: PsychCategory | undefined = rawCategory.includes('espac') ? 'espacial' : rawCategory.includes('abstract') ? 'abstracto' : rawCategory.includes('percep') ? 'percepcion' : rawCategory.includes('verb') ? 'verbal' : undefined;
  const rawTopic = Number(normalized.tema ?? normalized.topic);
  const error = !prompt || options.some((option) => !option) ? 'Completa el enunciado y las cuatro alternativas.' : correctIndex < 0 || correctIndex > 3 ? 'Selecciona la respuesta correcta.' : undefined;
  return { id: id(), prompt, options, correctIndex: correctIndex < 0 ? null : correctIndex, block, category, topic: Number.isInteger(rawTopic) && rawTopic > 0 ? rawTopic : undefined, collection: cell(normalized.coleccion ?? normalized.collection).trim() || undefined, source, sourceReference: `Fila ${rowNumber}`, error };
}
function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted; }
    else if (character === delimiter && !quoted) { row.push(field); field = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && text[index + 1] === '\n') index += 1; row.push(field); if (row.some((part) => part.length)) rows.push(row); row = []; field = ''; }
    else field += character;
  }
  row.push(field); if (row.some((part) => part.length)) rows.push(row); return rows;
}
function tableToDrafts(matrix: unknown[][], source: string): QuestionDraft[] {
  if (matrix.length < 2) return [];
  const keys = matrix[0].map((entry) => cell(entry).trim().toLowerCase().replaceAll(' ', '_'));
  return matrix.slice(1).map((values, index) => draft(Object.fromEntries(keys.map((key, column) => [key, values[column]])), source, index + 2));
}
export async function extractDrafts(file: File, block?: Block): Promise<QuestionDraft[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    const matrix = parseCsv(await file.text());
    return block === 'personalidad' ? personalityRowsToDrafts(matrix, file.name) : tableToDrafts(matrix, file.name);
  }
  if (extension === 'xlsx' || extension === 'xls') {
    const XLSX = await import('xlsx'); const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (block === 'personalidad') {
      const matrix = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' })).find((rows) => rows.some((row) => row.some((value) => cell(value).trim())));
      return matrix ? personalityRowsToDrafts(matrix, file.name) : [];
    }
    return tableToDrafts(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false }), file.name);
  }
  if (extension === 'docx') {
    const mammoth = await import('mammoth'); const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return parsePlainText(result.value, file.name, block);
  }
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; let text = '';
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const content = await pdf.getPage(page).then((item) => item.getTextContent());
      text += content.items.map((item) => 'str' in item ? `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}` : '').join('') + '\n';
    }
    return parsePlainText(text, file.name, block);
  }
  if (extension === 'txt') return parsePlainText(await file.text(), file.name, block);
  throw new Error('Formato no admitido. Usa CSV, XLS, XLSX, TXT, PDF o DOCX.');
}
function personalityRowsToDrafts(matrix: unknown[][], source: string): QuestionDraft[] {
  const normalize = (value: unknown) => cell(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const headerRowIndex = matrix.slice(0, 12).findIndex((row) => row.some((value) => /(?:enunciado|afirmacion|texto de (?:la )?pregunta|statement|question)/i.test(normalize(value))));
  const header = headerRowIndex >= 0 ? matrix[headerRowIndex] : [];
  const promptColumn = header.findIndex((value) => /(?:enunciado|afirmacion|texto de (?:la )?pregunta|statement|question)/i.test(normalize(value)));
  const referenceColumn = header.findIndex((value) => /(?:respuesta|opcion\s+elegida|contestacion)/i.test(normalize(value)));
  const rows = headerRowIndex >= 0 ? matrix.slice(headerRowIndex + 1) : matrix;
  const records = rows.map((row) => {
    let prompt = '';
    if (promptColumn >= 0) prompt = cell(row[promptColumn]).trim();
    else {
    const values = row.map((value) => cell(value).trim()).filter((value) => value && !/^\d{1,3}[.)]?$/.test(value));
      prompt = values.sort((left, right) => right.length - left.length)[0] ?? '';
    }
    const rawReference = referenceColumn >= 0 ? cell(row[referenceColumn]).trim() : '';
    const parsedReference = /^\d+$/.test(rawReference) ? Number(rawReference) : undefined;
    return { prompt, referenceAnswer: parsedReference };
  }).filter((record) => record.prompt);
  const filename = source.toLocaleLowerCase('es');
  const scale = filename.includes('competea') ? 7 : 4;
  const drafts = parsePersonalityText(records.map((record) => record.prompt).join('\n'), source).map((item, index) => ({ ...item, referenceAnswer: records[index]?.referenceAnswer && records[index]!.referenceAnswer! <= scale ? records[index]!.referenceAnswer : undefined }));
  if (filename.includes('ppv')) return drafts.slice(0, 217);
  if (filename.includes('competea')) return drafts.slice(0, 119);
  return drafts;
}
function parsePlainText(text: string, source: string, block?: Block): QuestionDraft[] {
  if (block === 'personalidad') return parsePersonalityText(text, source);
  const sections = text.split(/(?=^\s*(?:\d{1,4}[.)]|pregunta\s*\d+)\s*)/gim).filter((part) => part.trim());
  const candidates = sections.length > 1 ? sections : splitUnnumberedQuestions(text);
  const promotion = source.match(/\bpromo(?:s|ci[oó]n)?[\s_-]*(\d{1,3})/i)?.[1];
  const topicNumber = Number(source.match(/\btema[\s_-]*(\d{1,2})\b/i)?.[1]);
  const topic = Number.isInteger(topicNumber) && topicNumber >= 1 && topicNumber <= 54 ? topicNumber : undefined;
  return candidates.map((section, index) => {
    const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const all = lines.join('\n');
    const optionPattern = /(?:^|\s)([+*]?)\s*([a-d])[).]\s*/gim;
    const matches = [...all.matchAll(optionPattern)];
    let firstOption = -1;
    for (let candidate = 0; candidate <= matches.length - 4; candidate += 1) {
      if (matches.slice(candidate, candidate + 4).map((match) => match[2].toLowerCase()).join('') === 'abcd') firstOption = candidate;
    }
    let choices: RegExpMatchArray[] = [];
    if (firstOption >= 0) choices = matches.slice(firstOption, firstOption + 4);
    else {
      // Keep partial a/b/c option groups editable: some source questions were
      // published with fewer than four choices. Never invent them in parsing.
      for (let candidate = 0; candidate < matches.length; candidate += 1) {
        if (matches[candidate][2].toLowerCase() !== 'a') continue;
        let end = candidate + 1;
        while (end < matches.length && end - candidate < 4 && matches[end][2].toLowerCase() === 'abcd'[end - candidate]) end += 1;
        if (end - candidate > choices.length) choices = matches.slice(candidate, end);
      }
    }
    const prompt = all.slice(0, choices[0]?.index ?? all.length).replace(/^\s*(?:\d{1,4}[.)]|pregunta\s*\d+)\s*/i, '').trim();
    const parsedOptions = choices.map((match, choiceIndex) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = choices[choiceIndex + 1]?.index ?? all.length;
      return all.slice(start, end).trim();
    });
    const options = [...parsedOptions, ...Array(Math.max(0, 4 - parsedOptions.length)).fill('')] as QuestionDraft['options'];
    const marked = choices.findIndex((match) => Boolean(match[1]));
    const originalNumber = section.match(/^\s*(?:pregunta\s*)?(\d{1,4})[.)]/i)?.[1];
    return { id: id(), prompt, options, correctIndex: marked >= 0 ? marked : null, block: 'teoria', topic, collection: promotion ? `Promoción ${promotion}` : undefined, source, sourceReference: originalNumber ? `Pregunta ${originalNumber}` : `Fragmento ${index + 1}`, error: !prompt || options.some((option) => !option) ? 'No se han detectado con certeza el enunciado y las cuatro opciones; completa la revisión manual.' : marked < 0 ? 'Indica la respuesta correcta en la revisión.' : undefined };
  });
}

function parsePersonalityText(text: string, source: string): QuestionDraft[] {
  const lower = source.toLocaleLowerCase('es');
  const scale: 4 | 7 = lower.includes('competea') ? 7 : 4;
  const collection = lower.includes('competea') ? 'Competea' : lower.includes('ppv') ? 'PPV' : undefined;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = lines.filter((line) => !/^(?:ppv|competea|personalidad|cuestionario|test)(?:\s|$)/i.test(line) && !/^(?:enunciado|pregunta|ítem|item|n[ºo.]?\s*(?:pregunta|enunciado)?)\s*:?$/i.test(line));
  return items.map((line, index) => {
    const number = line.match(/^(?:pregunta\s*)?(\d{1,3})[.)]\s*/i)?.[1];
    const prompt = line.replace(/^(?:pregunta\s*)?\d{1,3}[.)]\s*/i, '').trim();
    return { id: id(), prompt, options: Array.from({ length: scale }, (_, optionIndex) => String(optionIndex + 1)), correctIndex: null, responseScale: scale, block: 'personalidad', collection, source, sourceReference: number ? `Pregunta ${number}` : `Pregunta ${index + 1}`, error: prompt ? undefined : 'Revisa el enunciado antes de guardar.' };
  });
}

/** Split legacy test sheets where each question is a line, sometimes followed by
 * four standalone option lines. Keep every character from the source text. */
function splitUnnumberedQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const optionOnly = /^([+*]?)\s*([a-d])[).]\s*(.*)$/i;
  const hasAllOptions = (value: string) => {
    const labels = [...value.matchAll(/(?:^|\s)[+*]?\s*([a-d])[).]\s*/gim)].map((match) => match[1].toLowerCase());
    return labels.some((_, index) => labels.slice(index, index + 4).join('') === 'abcd');
  };
  // Some older TXT files have no line break between questions. Their four
  // option labels still form repeated a/b/c/d groups. Split after the D option
  // when its sentence ends before the next question's A option.
  const flat = lines.join(' ');
  const markers = [...flat.matchAll(/(?:^|\s)([+*]?)\s*([a-d])[).]\s*/gim)];
  const groups: RegExpMatchArray[] = [];
  for (let index = 0; index <= markers.length - 4; index += 1) {
    if (markers.slice(index, index + 4).map((match) => match[2].toLowerCase()).join('') === 'abcd') {
      groups.push(markers[index + 3]);
      index += 3;
    }
  }
  if (groups.length > 1) {
    const boundaries: number[] = [];
    for (let index = 0; index < groups.length - 1; index += 1) {
      const start = (groups[index].index ?? 0) + groups[index][0].length;
      const end = groups[index + 1].index ?? flat.length;
      const between = flat.slice(start, end);
      const sentenceEnd = /[.!?](?=\s+(?:¿|[A-ZÁÉÍÓÚÑ]))/.exec(between);
      boundaries.push(sentenceEnd ? start + sentenceEnd.index + 1 : -1);
    }
    if (boundaries.every((boundary) => boundary >= 0)) {
      const chunks: string[] = [];
      let start = 0;
      for (const boundary of boundaries) {
        chunks.push(flat.slice(start, boundary).trim());
        start = boundary;
      }
      chunks.push(flat.slice(start).trim());
      return chunks.filter(Boolean);
    }
  }
  const result: string[] = [];
  for (let index = 0; index < lines.length;) {
    const separateOptions = lines.slice(index + 1, index + 5).map((line) => line.match(optionOnly));
    if (separateOptions.length === 4 && separateOptions.every((match, optionIndex) => match?.[2].toLowerCase() === 'abcd'[optionIndex])) {
      result.push([lines[index], ...lines.slice(index + 1, index + 5)].join('\n'));
      index += 5;
      continue;
    }
    if (hasAllOptions(lines[index])) {
      result.push(lines[index]);
      index += 1;
      continue;
    }
    // Preserve wrapped stems/options as a reviewable fragment until a full set is found.
    let fragment = lines[index];
    index += 1;
    while (index < lines.length && !hasAllOptions(fragment) && !hasAllOptions(lines[index])) {
      fragment += `\n${lines[index]}`;
      index += 1;
    }
    if (index < lines.length && hasAllOptions(lines[index])) {
      result.push(`${fragment}\n${lines[index]}`);
      index += 1;
    } else {
      result.push(fragment);
    }
  }
  return result.length ? result : [text];
}
export function toQuestion(item: QuestionDraft): Question {
  if (!item.prompt || item.options.some((option) => !option) || (item.block !== 'personalidad' && item.correctIndex === null)) throw new Error('Completa el enunciado, las opciones y la respuesta correcta.');
  return { id: id(), prompt: item.prompt, options: item.options, correctIndex: item.block === 'personalidad' ? undefined : item.correctIndex ?? undefined, responseScale: item.responseScale, referenceAnswer: item.responseScale && item.referenceAnswer && item.referenceAnswer <= item.responseScale ? item.referenceAnswer : undefined, block: item.block, category: item.category, topic: item.block === 'teoria' ? item.topic : undefined, collectionId: item.collection?.trim() || undefined, source: item.source, sourceReference: item.sourceReference, createdAt: new Date().toISOString() };
}
export const IMPORT_TEMPLATE_HEADERS = headers;
