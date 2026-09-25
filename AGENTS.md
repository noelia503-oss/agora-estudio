# Instrucciones para trabajar en este proyecto

Estas reglas se aplican a todo el repositorio. Antes de cambiar una fase, consulta `PROYECTO.md`, `PLAN.md` y `ESTADO.md`.

- Ejecuta solo la fase solicitada. Mantén cada cambio pequeño, comprobable y limitado a los archivos necesarios.
- No reformules, corrijas ni normalices el contenido de enunciados, alternativas o respuestas importadas. Conserva el texto aprobado y su procedencia.
- La carpeta raíz `material/` contiene contenido privado: no la leas, copies, muevas, incluyas en capturas ni publiques. Está excluida de Git y bloqueada en el servidor Vite. Importa únicamente los archivos seleccionados por la persona usuaria desde la interfaz; no empaquetes las fuentes ni sus copias de seguridad.
- Ninguna extracción de CSV, XLSX, TXT, PDF o DOCX entra directamente en el banco: exige validación y confirmación en una vista de revisión. TXT usa `+a)` como marca opcional de respuesta correcta; nunca se debe inferir la clave si falta.
- Usa la arquitectura y las reglas funcionales de `PROYECTO.md`. La sincronización privada con Google Drive está autorizada: limita el acceso al espacio `appDataFolder`, pide autorización explícita y nunca guardes tokens ni secretos en IndexedDB, GitHub o el código.
- Añade una dependencia solo cuando la fase la necesite; explica su finalidad en el cambio correspondiente.
- Evita modificar código funcional o archivos ajenos a la fase. Lee solo los archivos pertinentes y ejecuta las pruebas indicadas en `PLAN.md`.
- Al cerrar una fase, actualiza `ESTADO.md` con fecha, resultado, pruebas realizadas y siguiente paso. Si una prueba falla, registra el bloqueo sin marcar la fase como terminada.
- No inventes preguntas, claves de respuesta ni reglas oficiales de examen. Los simulacros usan la configuración del usuario y la puntuación definida en `PROYECTO.md`.
