# Plan de desarrollo

Cada fase debe terminar con un resultado utilizable o verificable por sí mismo. No se inicia la siguiente hasta registrar en `ESTADO.md` el resultado y las pruebas de la actual. Los nombres de archivos futuros son orientativos; conservar los límites funcionales aunque cambie la estructura.

## Fase 0 — Documentación y decisiones

- **Objetivo:** fijar alcance, arquitectura, reglas de trabajo y estado inicial.
- **Archivos afectados:** `AGENTS.md`, `PROYECTO.md`, `PLAN.md`, `ESTADO.md`.
- **Prueba:** comprobar presencia de los cuatro documentos, coherencia de decisiones y fases 1–7 pendientes en `ESTADO.md`.

## Fase 1 — Base visual y persistencia

- **Objetivo:** crear la aplicación React/TypeScript/Vite, navegación por los tres apartados, diseño adaptable y acceso versionado a IndexedDB.
- **Archivos afectados:** configuración del proyecto, entrada y vistas base, estilos, módulo de datos.
- **Prueba:** abrir los tres apartados en tamaños de Mac, iPad e iPhone; guardar un dato de prueba y comprobar que persiste tras recargar.

## Fase 2 — Importación estructurada

- **Objetivo:** importar CSV/XLSX y TXT, validar cuatro alternativas y clave, y revisar borradores antes de guardarlos. La plantilla estructurada usa `enunciado`, `opcion_a`–`opcion_d`, `correcta`, `bloque`, `tema`, `categoria` y `coleccion`.
- **Archivos afectados:** importadores CSV/XLSX/TXT, validación, vista de revisión, banco de preguntas.
- **Prueba:** importar un lote válido; mostrar errores de registros incompletos; confirmar que el texto y el orden de opciones aprobados coinciden con el archivo. En TXT comprobar también la marca `+a)`.

## Fase 3 — Importación documental

- **Objetivo:** extraer texto de PDF y DOCX hacia el mismo flujo de revisión, sin publicar preguntas automáticamente.
- **Archivos afectados:** adaptadores PDF/DOCX, vista de revisión y dependencias de extracción.
- **Prueba:** revisar un documento de cada formato y confirmar manualmente enunciado, cuatro alternativas, clave y procedencia antes de incorporarlo.

## Fase 4 — Consulta del banco

- **Objetivo:** consultar preguntas por bloque, tema, categoría y colección; mantener agrupados los exámenes anteriores y los dos tests de personalidad.
- **Archivos afectados:** vistas y consultas del banco.
- **Prueba:** comprobar que Teoría oculta preguntas hasta abrir “Temas” y seleccionar uno; localizar después preguntas de ese tema, una categoría psicotécnica, un examen anterior y cada test de personalidad.

## Fase 5 — Sesiones de examen

- **Objetivo:** realizar tests personalizados, simulacros configurados, simulacros importados y exámenes anteriores; guardar progreso, respuestas y puntuación. Los tests personalizados de teoría pueden incluir todas las preguntas filtradas y mostrar la corrección inmediatamente tras cada respuesta.
- **Archivos afectados:** motor de sesiones, vistas de test, ajustes del simulacro y persistencia de intentos.
- **Prueba:** completar una sesión, recuperar otra tras recargar, verificar orden y puntuación, probar una importación revisada de simulacro y comprobar el cierre al agotar el tiempo.

## Fase 6 — Historial y errores

- **Objetivo:** consultar intentos y resultados, identificar errores y crear un nuevo test con preguntas falladas.
- **Archivos afectados:** vistas de resultados, consultas de intentos y selección de falladas.
- **Prueba:** comprobar que el historial conserva respuestas y resultados; repetir solo preguntas falladas y guardar el nuevo intento.

## Fase 7 — Respaldo y verificación final

- **Objetivo:** exportar y restaurar datos locales, comprobar el flujo completo y la interfaz adaptable.
- **Archivos afectados:** importación/exportación JSON, ajustes y pruebas de integración.
- **Prueba:** exportar y restaurar banco, configuración e historial; recorrer los tres apartados en tamaños de Mac, iPad e iPhone.

## Extensión — Espacio visual para psicotécnicos

- **Objetivo:** importar PNG, JPG/JPEG, HEIC y PDF seleccionados por la usuaria, organizarlos por área y abrir imágenes o páginas en un visor táctil con lápiz, borrador, deshacer y borrado completo. Convertir HEIC a JPEG en el navegador y guardar archivos y anotaciones en IndexedDB local.
- **Archivos afectados:** `src/PsychSheets.tsx`, `src/psych-sheets.css`, `src/data/database.ts`, `src/App.tsx` y dependencias de HEIC.
- **Prueba:** seleccionar imágenes y un PDF desde la interfaz, comprobar el cambio de página, dibujar, borrar y deshacer; recargar y confirmar persistencia. Comprobar HEIC y controles en Mac, iPad y iPhone.

## Extensión — Instalación como aplicación de escritorio

- **Objetivo:** abrir Ágora desde un icono de Mac como una app nativa, con los archivos web incluidos y sin iniciar manualmente el servidor de desarrollo.
- **Archivos afectados:** `electron/main.cjs`, configuración/scripts/dependencias de `package.json`, `build/icon.*`, `src/main.tsx`, `src/App.tsx`, `.gitignore` y documentación de despliegue.
- **Prueba:** generar el DMG para Mac, abrir la app empaquetada, comprobar que arranca sin Vite y que su archivo no contiene `material/`. Confirmar que puede instalarse arrastrándola a Aplicaciones. Los datos IndexedDB de la app de escritorio son propios; se trasladan con una copia JSON.

## Fase 8 — Copia privada en Google Drive

- **Objetivo:** guardar y restaurar manualmente datos de estudio en `appDataFolder` de Google Drive, incluyendo preguntas, colecciones, intentos, ajustes, sesión en curso y láminas con sus anotaciones. Mantener IndexedDB como copia local.
- **Archivos afectados:** `src/data/database.ts`, nuevo `src/data/google-drive-sync.ts`, `src/App.tsx`, `src/vite-env.d.ts`, `.env.example`, `.github/workflows/deploy-pages.yml`, `AGENTS.md`, `PROYECTO.md`, `PLAN.md` y `ESTADO.md`.
- **Prueba:** `npm run build`; comprobar que falta de configuración de OAuth muestra un aviso claro; revisar que el alcance solicitado sea solo `drive.appdata`, que los datos no se escriban en stores públicos de Drive y que `dist/material` no exista. Tras configurar credenciales Google, guardar en Drive desde un dispositivo y restaurar en otro; comparar banco, una lámina/anotación, historial y sesión en curso.
- **Límite:** es copia/restauración manual, no sincronización automática. Cada dispositivo conserva su propio IndexedDB. Requiere un OAuth Client ID web público (no secreto) y el Drive API habilitado en Google Cloud.

## Extensión — Subgrupos de láminas psicotécnicas

- **Objetivo:** clasificar láminas por área y subgrupo a partir de las carpetas aportadas, tanto al importar como al navegar por la biblioteca.
- **Archivos afectados:** `src/PsychSheets.tsx`, `src/data/database.ts`, `PROYECTO.md`, `ESTADO.md`.
- **Prueba:** elegir cada área y subgrupo, importar una lámina y comprobar que queda visible solo en ese grupo tras recargar y restaurar una copia.
