import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { deleteRecord, getAll, saveRecord } from './data/database';
import type { DrawingStroke, PsychCategory, PsychSheet } from './data/database';
import './psych-sheets.css';

const areas: { id: PsychCategory; label: string }[] = [
  { id: 'espacial', label: 'Razonamiento espacial' },
  { id: 'abstracto', label: 'Razonamiento abstracto' },
  { id: 'percepcion', label: 'Percepción' },
  { id: 'verbal', label: 'Verbal' },
];
const subgroups: Record<PsychCategory, string[]> = {
  espacial: ['Rotación espacial', 'Cubos', 'Pirámides', 'Recortables', 'Pentaedros', 'Octaedros', 'Hexaedros', 'Heptaedros', 'Giros Angulares'],
  abstracto: ['Dominos', 'Series de figuras', 'Ecuaciones', 'Velocímetros', 'Cuadros lógicos', 'Cambio de medidas', 'Matrices', 'Matrices numéricas', 'Matrices (2)', 'Jeroglíficos'],
  percepcion: ['Sopas de letras', 'Similitudes', 'Identificación de caracteres', 'Diferencias'],
  verbal: ['Antónimos', 'Definiciones', 'Analogías', 'Sinónimos', 'Deducciones', 'Comprensión lectora', 'Campos semánticos'],
};
const makeId = () => crypto.randomUUID();
async function openPdf(blob: Blob) {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const task = pdfjs.getDocument({ data: await blob.arrayBuffer() });
  return { document: await task.promise, destroy: () => task.destroy() };
}
type OpenedPdf = Awaited<ReturnType<typeof openPdf>>;

export default function PsychSheets({ onClose }: { onClose: () => void }) {
  const [sheets, setSheets] = useState<PsychSheet[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [category, setCategory] = useState<PsychCategory>('espacial');
  const [subgroup, setSubgroup] = useState('');
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#c43b32');
  const [brush, setBrush] = useState(7);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocumentRef = useRef<{ id: string; pdf: OpenedPdf } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const activeStroke = useRef<DrawingStroke | null>(null);
  const strokesRef = useRef<DrawingStroke[]>([]);
  const selected = sheets.find((sheet) => sheet.id === selectedId);
  const visibleSheets = sheets.filter((sheet) => sheet.category === category && (sheet.subgroup ?? '') === subgroup);
  const index = visibleSheets.findIndex((sheet) => sheet.id === selectedId);
  const isPdf = selected?.format === 'pdf';
  const currentStrokes = selected?.format === 'pdf'
    ? selected.pageStrokes?.[String(currentPage)] ?? (currentPage === 1 ? selected.strokes : [])
    : selected?.strokes ?? [];

  useEffect(() => {
    let mounted = true;
    getAll<PsychSheet>('psychSheets').then((items) => {
      if (!mounted) return;
      const ordered = items.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      setSheets(ordered);
      if (ordered[0]) { setSelectedId(ordered[0].id); setCategory(ordered[0].category); setSubgroup(ordered[0].subgroup ?? ''); }
    }).catch(() => setError('No se pudieron cargar las láminas guardadas.')).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => () => {
    const opened = pdfDocumentRef.current;
    pdfDocumentRef.current = null;
    if (opened) void opened.pdf.destroy();
  }, []);

  useEffect(() => {
    if (!selected) {
      strokesRef.current = [];
      redraw([]);
      const previous = pdfDocumentRef.current;
      pdfDocumentRef.current = null;
      if (previous) void previous.pdf.destroy();
      return;
    }
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    const image = imageRef.current;
    const ink = canvasRef.current;
    if (selected.format === 'pdf') {
      void (async () => {
        try {
          let opened = pdfDocumentRef.current?.id === selected.id ? pdfDocumentRef.current.pdf : undefined;
          if (!opened) {
            const previous = pdfDocumentRef.current;
            pdfDocumentRef.current = null;
            if (previous) await previous.pdf.destroy();
            if (cancelled) return;
            opened = await openPdf(selected.image);
            if (cancelled) { await opened.destroy(); return; }
            pdfDocumentRef.current = { id: selected.id, pdf: opened };
          }
          const document = opened.document;
          if (cancelled) return;
          setPageCount(document.numPages);
          const page = await document.getPage(currentPage);
          const viewport = page.getViewport({ scale: 1.8 });
          const pageCanvas = pdfCanvasRef.current;
          const pageContext = pageCanvas?.getContext('2d');
          if (!pageCanvas || !pageContext || !ink || cancelled) return;
          pageCanvas.width = viewport.width;
          pageCanvas.height = viewport.height;
          ink.width = viewport.width;
          ink.height = viewport.height;
          const renderTask = page.render({ canvas: pageCanvas, canvasContext: pageContext, viewport });
          cancelRender = () => renderTask.cancel();
          await renderTask.promise;
          if (cancelled) return;
          const saved = selected.pageStrokes?.[String(currentPage)] ?? (currentPage === 1 ? selected.strokes : []);
          strokesRef.current = saved;
          redraw(saved);
        } catch { if (!cancelled) setError('No se pudo abrir este PDF. Comprueba que el archivo no esté protegido o dañado.'); }
      })();
      return () => { cancelled = true; cancelRender?.(); };
    }
    const previous = pdfDocumentRef.current;
    pdfDocumentRef.current = null;
    if (previous) void previous.pdf.destroy();
    setPageCount(1);
    strokesRef.current = selected.strokes ?? [];
    redraw(strokesRef.current);
    if (!image || !ink) return;
    const url = URL.createObjectURL(selected.image);
    image.src = url;
    const resize = () => {
      if (!image.naturalWidth || !image.naturalHeight || cancelled) return;
      ink.width = image.naturalWidth;
      ink.height = image.naturalHeight;
      redraw(strokesRef.current);
    };
    image.addEventListener('load', resize);
    if (image.complete) resize();
    const observer = new ResizeObserver(resize);
    observer.observe(image);
    return () => { cancelled = true; image.removeEventListener('load', resize); observer.disconnect(); URL.revokeObjectURL(url); };
  }, [selected?.id, selected?.image, selected?.format, currentPage]);

  function redraw(strokes = strokesRef.current) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) paintStroke(context, stroke);
  }

  async function persist(strokes: DrawingStroke[]) {
    if (!selected) return;
    const updated = selected.format === 'pdf'
      ? { ...selected, strokes: currentPage === 1 ? strokes : selected.strokes, pageStrokes: { ...selected.pageStrokes, [String(currentPage)]: strokes } }
      : { ...selected, strokes };
    strokesRef.current = strokes;
    setSheets((current) => current.map((sheet) => sheet.id === updated.id ? updated : sheet));
    try { await saveRecord('psychSheets', updated); setError(''); }
    catch { setError('No se pudo guardar el dibujo en este dispositivo.'); }
  }

  async function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => /\.(png|jpe?g|heic|heif|pdf)$/i.test(file.name));
    if (!files.length) { setError('Selecciona archivos PNG, JPG, HEIC o PDF.'); event.target.value = ''; return; }
    try {
      const created: PsychSheet[] = [];
      for (const file of files) {
        const isPdfFile = file.name.toLowerCase().endsWith('.pdf');
        const isHeicFile = /\.(heic|heif)$/i.test(file.name);
        let image: Blob = file;
        if (isHeicFile) {
          const { heicTo } = await import('heic-to');
          image = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
        }
        const pdf = isPdfFile ? await openPdf(file) : undefined;
        created.push({ id: makeId(), name: file.name, category, subgroup: subgroup || undefined, image, format: isPdfFile ? 'pdf' : 'image', pageCount: pdf?.document.numPages ?? 1, strokes: [], pageStrokes: isPdfFile ? {} : undefined, createdAt: new Date().toISOString() });
        if (pdf) await pdf.destroy();
      }
      for (const sheet of created) await saveRecord('psychSheets', sheet);
      setSheets((current) => [...current, ...created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setSelectedId(created[0].id);
      setCurrentPage(1);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? `No se pudo leer el archivo: ${cause.message}` : 'No se pudieron guardar los archivos. Comprueba que sean PNG, JPG, HEIC o PDF válidos.'); }
    event.target.value = '';
  }

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!selected || !canvasRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const first = point(event);
    const bounds = canvasRef.current.getBoundingClientRect();
    activeStroke.current = { tool, color, width: brush * (canvasRef.current.width / Math.max(1, bounds.width)), points: [first, first] };
    const context = canvasRef.current.getContext('2d');
    if (context) paintStroke(context, activeStroke.current);
  }
  function moveStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = activeStroke.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    const nextPoint = point(event);
    const previous = stroke.points[stroke.points.length - 1];
    stroke.points.push(nextPoint);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.save();
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    context.restore();
  }
  function endStroke() {
    if (!activeStroke.current) return;
    const nextStrokes = [...strokesRef.current, activeStroke.current];
    activeStroke.current = null;
    void persist(nextStrokes);
  }
  function goToSheet(nextIndex: number) {
    const next = visibleSheets[nextIndex];
    if (next) { setSelectedId(next.id); setCategory(next.category); setSubgroup(next.subgroup ?? ''); setCurrentPage(1); }
  }
  function previous() { if (isPdf && currentPage > 1) setCurrentPage((page) => page - 1); else goToSheet(index - 1); }
  function next() { if (isPdf && currentPage < pageCount) setCurrentPage((page) => page + 1); else goToSheet(index + 1); }
  function adjustZoom(change: number) { setZoomLevel((current) => Math.min(3, Math.max(0.5, Math.round((current + change) * 10) / 10))); }
  async function removeCurrent() {
    if (!selected || !window.confirm(`¿Eliminar la lámina «${selected.name}» y sus anotaciones?`)) return;
    await deleteRecord('psychSheets', selected.id);
    const remaining = sheets.filter((sheet) => sheet.id !== selected.id);
    setSheets(remaining);
    const nextInGroup = remaining.find((sheet) => sheet.category === category && (sheet.subgroup ?? '') === subgroup);
    setSelectedId(nextInGroup?.id ?? '');
    setCurrentPage(1);
  }
  function clearDrawing() {
    redraw([]);
    void persist([]);
  }

  return <section className="psych-workspace" aria-label="Visor de láminas psicotécnicas">
    <header className="psych-workspace-header">
      <button className="button secondary" onClick={onClose}>← Psicotécnicos</button>
      <div><span className="eyebrow">ESPACIO DE PRÁCTICA VISUAL</span><h1>Láminas psicotécnicas<span className="period">.</span></h1></div>
      <label className="button primary psych-upload">＋ Añadir archivos<input type="file" accept="image/png,image/jpeg,image/heic,image/heif,application/pdf,.png,.jpg,.jpeg,.heic,.heif,.pdf" multiple onChange={(event) => void addImages(event)} hidden /></label>
    </header>
    <div className="psych-workspace-layout">
      <aside className="psych-sheet-library">
        <label className="psych-area-select">Área<select value={category} onChange={(event) => { const next = event.target.value as PsychCategory; const first = sheets.find((sheet) => sheet.category === next); setCategory(next); setSubgroup(first?.subgroup ?? ''); setSelectedId(first?.id ?? ''); }}>
          {areas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}</select></label>
        <label className="psych-area-select">Subgrupo<select value={subgroup} onChange={(event) => { const next = event.target.value; const first = sheets.find((sheet) => sheet.category === category && (sheet.subgroup ?? '') === next); setSubgroup(next); setSelectedId(first?.id ?? ''); }}><option value="">Sin subgrupo</option>{subgroups[category].map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <div className="psych-library-title"><strong>{subgroup || 'Sin subgrupo'}</strong><span>{visibleSheets.length}</span></div>
        {busy ? <p className="psych-library-empty">Cargando láminas…</p> : visibleSheets.length ? <div className="psych-sheet-list">{visibleSheets.map((sheet) => <button key={sheet.id} className={`psych-sheet-item ${sheet.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(sheet.id); setCategory(sheet.category); setSubgroup(sheet.subgroup ?? ''); }}><span className="psych-sheet-icon">▧</span><span><strong>{sheet.name}</strong><small>{sheet.subgroup || 'Sin subgrupo'}</small></span></button>)}</div> : <div className="psych-library-empty"><span>▧</span><strong>Aún no hay láminas</strong><p>Selecciona «Añadir archivos» para guardar láminas dentro de este subgrupo. Se almacenarán solo en este dispositivo.</p></div>}
      </aside>
      <main className="psych-viewer">
        <div className="psych-tools" aria-label="Herramientas de dibujo">
          <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} aria-pressed={tool === 'pen'}>✎ <span>Lápiz</span></button>
          <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'}>⌫ <span>Borrador</span></button>
          <label className="psych-color" title="Color del lápiz"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Color del lápiz" /></label>
          <label className="psych-brush">Grosor <input type="range" min="2" max="24" value={brush} onChange={(event) => setBrush(Number(event.target.value))} /><span>{brush}</span></label>
          <span className="psych-tool-spacer" />
          <button onClick={() => void persist(strokesRef.current.slice(0, -1))} disabled={!currentStrokes.length}>↶ <span>Deshacer</span></button>
          <button onClick={clearDrawing} disabled={!currentStrokes.length}>Borrar todo</button>
          <div className="psych-zoom-controls" role="group" aria-label="Zoom de la lámina">
            <button aria-label="Alejar" title="Alejar" onClick={() => adjustZoom(-0.1)} disabled={zoomLevel <= 0.5}>−</button>
            <output aria-live="polite">{Math.round(zoomLevel * 100)}%</output>
            <button aria-label="Acercar" title="Acercar" onClick={() => adjustZoom(0.1)} disabled={zoomLevel >= 3}>＋</button>
            <button className="psych-zoom-reset" aria-label="Restablecer zoom al 100%" title="Restablecer zoom" onClick={() => setZoomLevel(1)}>↺</button>
          </div>
        </div>
        {error && <p className="psych-message" role="status">{error}</p>}
        <div className="psych-canvas-area">
          {selected ? <div className="psych-page-wrap" style={{ zoom: zoomLevel }}>
            {isPdf ? <canvas ref={pdfCanvasRef} className="psych-pdf-page" aria-label={`Página ${currentPage} del PDF`} /> : <img ref={imageRef} alt={selected.name} />}
            <canvas ref={canvasRef} className="psych-ink-layer" aria-label="Lienzo para dibujar sobre la lámina" onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke} onPointerCancel={endStroke} />
          </div> : <div className="psych-empty-view"><span>✳</span><h2>Tu mesa de trabajo</h2><p>Añade láminas, imágenes o PDF para abrirlos aquí. Podrás dibujar y borrar sobre cada página.</p><label className="button primary psych-upload">Seleccionar archivos<input type="file" accept="image/png,image/jpeg,image/heic,image/heif,application/pdf,.png,.jpg,.jpeg,.heic,.heif,.pdf" multiple onChange={(event) => void addImages(event)} hidden /></label></div>}
        </div>
        {selected && <footer className="psych-viewer-footer"><button className="button secondary" disabled={isPdf ? currentPage <= 1 : index <= 0} onClick={previous}>← Anterior</button><span>{selected.name}{isPdf ? ` · Página ${currentPage} de ${pageCount}` : ` · ${index + 1} de ${sheets.length}`}</span><button className="button secondary" disabled={isPdf ? currentPage >= pageCount : index >= sheets.length - 1} onClick={next}>Siguiente →</button><button className="psych-delete" onClick={() => void removeCurrent()}>Eliminar archivo</button></footer>}
      </main>
    </div>
  </section>;
}

function paintStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke) {
  if (!stroke.points.length) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const item of stroke.points.slice(1)) context.lineTo(item.x, item.y);
  context.stroke();
  context.restore();
}
