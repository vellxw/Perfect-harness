# Arquitectura reactiva de la terminal

## Límites entre capas

`Perfect Core → PresentationEngine → IPC privado entre procesos → EngineClient → OpenTUI/React`.

El dominio, el orquestador, las rutas de modelos, los presupuestos, la asignación de archivos, el evaluador y los contenedores aislados siguen siendo autoritativos. `UiActionSchema` admite intenciones explícitas, no nombres arbitrarios de métodos ni escrituras del estado del objetivo. Ninguna acción de la interfaz puede establecer `DONE`. Aprobar un plan incluye su hash visible; aplicar cambios o aprobar un criterio humano incluye la revisión candidata. El núcleo vuelve a validarlos antes de modificar estado.

`perfect` abre la interfaz cuando se ejecuta en una terminal interactiva. Los subcomandos tradicionales y `--json` la omiten. Sin una terminal interactiva, se muestra ayuda y no secuencias de control. FFI experimental de Node se habilita en el proceso de OpenTUI. Pi y SQLite se ejecutan en otro proceso local para separar la base de datos y los proveedores de la respuesta al teclado. No hay servidor HTTP ni panel web.

## Eventos y vistas derivadas

SQLite conserva la versión 1 del esquema de V1. El controlador cambió de better-sqlite3 a `DatabaseSync` después de las pruebas de regresión. Las transacciones usan `BEGIN IMMEDIATE` y puntos de guardado anidados. Los cambios del dominio y sus eventos son atómicos; los suscriptores se despiertan solo al confirmar la transacción exterior. Una reversión no publica estado especulativo.

El motor de presentación recibe notificaciones posteriores a cada transacción y avisos del sistema de archivos cuando otro proceso de la CLI cambia el estado. Agrupa notificaciones durante 20 ms y publica una vista solo si cambia su contenido serializado. No existe un ciclo permanente que borre toda la pantalla cada segundo. Estas notificaciones locales no son coordinación distribuida; actualizar o reconectar reconstruye el estado desde SQLite.

Las vistas limitan la carga a 500 tareas, 200 registros de evidencia y 1.000 eventos de origen reducidos a las últimas 120 entradas de actividad. Los detalles permanecen disponibles en la CLI tradicional y el almacén de evidencia. Las filas se ajustan a la ventana visible. Se conservan las dependencias múltiples del grafo, sin fingir que cada tarea tiene un único padre.

## Acciones y ciclo de vida

Las acciones se validan y serializan antes de ejecutarse para impedir inicios duplicados. Los objetivos prolongados, las verificaciones manuales y la preparación de dependencias mantienen su tipo de operación y mecanismo de cancelación. Pausar o cancelar propaga la orden a las herramientas activas. Cerrar la interfaz pausa el objetivo y espera un punto seguro, en lugar de borrar el trabajo. Un cierre inesperado deja la recuperación a los mecanismos del núcleo; reconectar no implica éxito.

La autenticación circula por IPC heredado. Los secretos usan un campo enmascarado separado y no entran en la vista visible, el estado de presentación, los eventos del dominio ni los registros. Cancelar una solicitud interrumpe el flujo del proveedor. El diagnóstico no envía inferencias; una prueba real requiere una acción explícita.

## Capa visual

Una superficie principal reúne encabezado, objetivo, actividad cronológica, panel lateral solo en terminales anchas y un campo de escritura permanente. Los paneles superpuestos muestran agentes, plan, tareas, verificaciones de la revisión actual, evidencia, cambios, consumo, registros, diagnóstico y ajustes. Flechas, Enter y comandos son suficientes; el mouse es opcional. Ctrl+J ofrece una nueva línea cuando la terminal no distingue Shift+Enter.

Los colores mantienen la dirección obsidiana y lavanda. El desenfoque de ventana depende de la terminal anfitriona, no de celdas OpenTUI. Las animaciones son transiciones breves y finitas, e indicadores de actividad que se detienen al quedar inactivo. Se admiten animaciones reducidas o desactivadas y detección automática de conexiones remotas y CI. No es una reproducción por píxeles de la referencia generada.

## Español y compatibilidad

La versión 0.2.1 localiza las etiquetas, explicaciones, ayuda, confirmaciones y comandos visibles. `src/i18n/es.ts` resuelve nombres españoles hacia acciones canónicas; `src/i18n/messages.ts` traduce mensajes conocidos al mostrarlos. No se traduce indiscriminadamente el contenido del dominio ni se añaden llamadas a modelos para traducir.

Los argumentos posteriores a `--`, el texto del objetivo, rutas, credenciales, claves JSON, enums, modelos y niveles literales mantienen su identidad. Escribir `CANCELAR` en una confirmación produce el permiso interno `ABORT` únicamente para la acción y el objetivo mostrados. Los planes y explicaciones nuevos se solicitan en español, preservando los contratos estructurados. La CLI humana tiene etiquetas españolas; `--json` conserva el esquema original.

## Seguridad

Se eliminan secuencias OSC, CSI y controles de los textos de presentación y la salida humana localizada. No se ejecutan instrucciones recibidas en registros. La interfaz no puede actualizar silenciosamente referencias visuales, modelos ni evidencia. Los archivos se resuelven dentro del objetivo seleccionado, se valida su hash y se limita su ubicación. Imágenes y videos pueden abrirse mediante una acción; HTML, ejecutables, scripts y archivos comprimidos no se abren automáticamente. Las URLs de autenticación se limitan a orígenes oficiales configurados. Consentimiento Contributor y clasificación pública/privada siguen siendo autorizaciones independientes.

## Pruebas

Se usa el renderizador nativo real en 80×24, 100×30, 120×36 y 160×45. Se comprueban paneles, teclado, líneas múltiples, cancelación escrita, cambio de tamaño, metadatos desconocidos, dependencias compartidas, saneamiento de controles, transacciones, puntos de guardado y notificaciones en reposo. La localización añade alias españoles/originales, tildes y eñes, confirmaciones y conservación de JSON.

La prueba de carga utiliza 20.000 eventos visibles, 500 tareas y 1.000 actualizaciones. Mide el despacho al renderizador y su siguiente imagen, no la latencia física de la pantalla ni una garantía del sistema operativo.
