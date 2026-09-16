# Perfect Desktop V5 — aceptación del candidato

Base histórica: V4 0.4.0, f527a2f491e30e482d46c14138429bd90916da85. V5 conserva el controlador, scheduler, Pi, SQLite, permisos y Judge. La GUI no declara DONE.

Esta matriz define requisitos; no afirma que un run futuro haya pasado. El resultado efectivo se obtiene de la ejecución de `v5-acceptance.yml` del SHA exacto y de sus artifacts. Un commit anterior o un árbol preparado no certifica el candidato distribuido.

| Gate | Requisito de cierre | Evidencia |
|---|---|---|
| Compatibilidad | Electron y Node separados, GUI, IPC, cierre | Contratos, recorridos Linux/Windows y binario final |
| Seguridad | Origen/emisor, permisos, recursos, preview y credenciales | Pruebas adversariales y ejecutable endurecido |
| Paridad | Acciones esenciales de V4 con mouse y teclado | Recorridos de la GUI conectada al motor |
| Skills | Manual por versión/hash, equipo, revocación y creador | Contextos reales, IPC, almacenamiento y A/B |
| Goal Loop | Fallo real, reparación, revisión actual, Judge y aplicar | Video continuo, eventos, tests y verificación de persistencia |
| Diseño | Black glass legible, estados, teclado, resize y DPI | Capturas abiertas e inspeccionadas; no solo DOM |
| Rendimiento | Inicio, input, idle, memoria, streams y uso prolongado | Benchmark FULL y motion de producción |
| Medios | Recursos autorizados, video por rangos y GLB | Archivos reales, aislamiento y ciclo de vida |
| Windows | Limpia, V4→V5, portable, CLI y desinstalación | Los mismos binarios que se entregan, reporte y video |
| Distribución | Main aprobado, tag exacto, publicación y redescarga | Hashes y smoke Windows del binario público |

## Automatización y revisión

Los gates automatizados son `core`, `blender`, `terminal`, `desktop`, `goal-loop`, `performance` y `windows`. La fase agregadora verifica los reportes, hashes, decodificación completa y presencia de cuatro grabaciones. Produce `AUTOMATED_PASS_VISUAL_REVIEW_REQUIRED`, no una aprobación estética.

La inspección visual debe referir a esos archivos exactos. El revisor no puede declarar que vio imágenes o videos que sus herramientas no abrieron. Si ese acceso falla, la revisión queda bloqueada; no se sustituye por una nota numérica, OCR o un archivo que simplemente existe.

No omitir un gate fallido para fusionar. La rama se fusiona después de la aceptación y revisión correspondientes; el SHA real de main vuelve a construir y probar los binarios. La publicación requiere una revisión final ligada a los artifacts de main y descarga los archivos públicos para comprobarlos otra vez.

## Fronteras de la evidencia

Las inferencias del fixture del Goal Loop son sintéticas y están identificadas. El controlador, archivos, Docker, pruebas, reparación y Judge son reales. Otras pruebas atraviesan Pi con transporte sintético; ninguna certifica las cuentas personales del usuario.

La captura del contenido Electron no equivale al escritorio de Windows. Los videos nativos de instalación y uso registran su método y plataforma. Windows Server 2025 CI no sustituye una prueba en la PC personal Windows 11.

Siete pruebas pesadas se ejecutan fuera de la suite nativa. Un skip en esa suite no es PASS: el job especializado debe ejecutarlas. El publicador V4 ya no publica al llegar cambios a main; V5 utiliza la promoción explícita documentada.

No hay procedimientos temporales que reescriban la fuente durante un build normal. Los scripts de compilación y prueba son reproducibles y forman parte del producto/mantenimiento. Los informes de cada run quedan en artifacts o comentarios para no invalidar el SHA con un commit de resultados.
