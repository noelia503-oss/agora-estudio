# Proyecto: aplicación web de estudio para oposición policial

## Objetivo y alcance

Centralizar preguntas y resultados de estudio en tres apartados:

1. **Teoría:** 54 temas numerados, tests personalizados, simulacros y exámenes de promociones anteriores.
2. **Psicotécnicos:** razonamiento espacial, razonamiento abstracto, percepción y verbal.
3. **Personalidad:** PPV (217 enunciados, escala 1–4) y Competea (119 enunciados aprox., escala 1–7). Son cuestionarios de autovaloración: no tienen respuesta correcta ni puntuación de aciertos.

La interfaz debe adaptarse a Mac, iPad e iPhone. La primera versión funciona para una persona, en un navegador y sin conexión entre dispositivos.

## Arquitectura propuesta

- **Cliente:** React con TypeScript y Vite. Navegación y estilos adaptables; sin biblioteca de componentes obligatoria.
- **Persistencia:** IndexedDB mediante un módulo de acceso a datos propio. Versionar el esquema para poder migrar datos sin perder preguntas ni intentos.
- **Despliegue:** interfaz web estática empaquetada como aplicación de escritorio con Electron para Mac; el icono inicia Ágora y carga los archivos locales de la propia app, sin Vite, navegador externo ni servidor separado. La PWA para iPhone/iPad se publicará en GitHub Pages desde `dist/` mediante GitHub Actions. La carpeta `material/`, las preguntas y las copias de seguridad no se publican; IndexedDB sigue siendo local a cada dispositivo. GitHub Pages sirve la web públicamente incluso cuando el repositorio de origen es privado.
- **Respaldo:** exportación e importación de un archivo JSON versionado que incluya banco, configuración e historial. Validar el archivo completo antes de restaurarlo y pedir confirmación antes de sustituir datos locales.
- **Importación de preguntas:** CSV y `.xlsx` estructurados; TXT, PDF y `.docx` mediante extracción de texto. Cada formato produce borradores para una misma vista de revisión. En teoría y psicotécnicos se exige clave; en personalidad los textos se separan en enunciados y se asigna la escala del cuestionario, sin inventar claves. PDF.js y Mammoth se usan solo en los importadores documentales.

El almacenamiento es local al navegador y al dispositivo. La copia de seguridad es necesaria para trasladar datos o recuperarlos si se borra el almacenamiento del navegador.

La versión de escritorio tiene su propio almacenamiento IndexedDB local, aislado del navegador y de otros dispositivos. Para trasladar preguntas e historial se usa la copia de seguridad JSON. El paquete contiene únicamente archivos compilados de la app; nunca incluye la carpeta privada `material/` ni sus documentos.

## Privacidad del material de estudio

La carpeta raíz `material/` es privada. Está excluida por `.gitignore`, denegada al servidor Vite y fuera del directorio de salida `dist/`. Nunca debe colocarse dentro de `public/` ni importarse desde código fuente. Los archivos solo se leen cuando la persona usuaria los selecciona en el importador; el contenido aprobado queda en IndexedDB local. Las copias JSON pueden contener preguntas y también deben tratarse como privadas.

## Modelo funcional mínimo

- **Pregunta:** identificador estable, bloque, tema o categoría, colección opcional, enunciado, alternativas en orden, clave objetiva opcional y procedencia. Personalidad puede guardar además una respuesta de referencia personal numérica, separada de la clave correcta.
- **Colección:** identificador, tipo (examen anterior o test de personalidad), título y metadatos de procedencia. Los exámenes anteriores conservan su agrupación y orden de origen.
- **Intento:** identificador, modalidad, fecha, configuración aplicada, lista ordenada de preguntas y respuestas dadas, duración y resultado. Guardar una copia del contenido usado para que el historial siga siendo interpretable si cambia el banco.
- **Ajustes:** configuración fija del simulacro (contenidos, cantidad y tiempo), definida por el usuario antes del primer simulacro.
- **Lote de importación:** archivo y origen, borradores, errores de validación y estado de revisión. Solo los registros aprobados se incorporan al banco.
- **Lámina psicotécnica:** PNG, JPG/JPEG o HEIC seleccionado por la usuaria, o documento PDF multipágina; incluye área psicotécnica y trazos superpuestos (lápiz o borrador). HEIC se convierte a JPEG en el navegador. Archivos y trazos por página se guardan en IndexedDB local; no se empaquetan en la web ni se suben a un servidor.

La puntuación inicial de teoría y psicotécnicos es **1 por acierto y 0 por fallo o pregunta sin responder**, sin penalización. Personalidad no se califica por aciertos; una plantilla previa opcional sirve únicamente para comparar coincidencias de respuestas. El test personalizado permite elegir contenidos y cantidad. El simulacro aplica los ajustes guardados y termina al agotar el tiempo. Repetir falladas crea un nuevo intento con las preguntas respondidas incorrectamente en intentos anteriores.

## Integridad del contenido

El texto aprobado de enunciados y alternativas se conserva y se muestra sin reformulación automática. La extracción de PDF y DOCX puede alterar el orden de lectura de texto y tablas: la persona usuaria debe verificar enunciado, cuatro opciones y clave antes de guardar. Registrar siempre la procedencia para poder contrastar la pregunta con su fuente.

## Decisiones pendientes de material de origen

La plantilla exacta de columnas y el reconocimiento de preguntas en PDF/DOCX se comprobarán con archivos reales durante las fases de importación. Hasta entonces, el flujo de revisión manual cubre documentos cuyo diseño no permita separar preguntas con seguridad.

Quedan fuera de la primera versión: `.xls`, `.doc`, preguntas que dependan de imágenes, sincronización, cuentas, baremos de personalidad y reglas oficiales de puntuación no facilitadas.
