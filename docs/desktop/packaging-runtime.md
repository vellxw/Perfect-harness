# Runtime de la distribución V5

El motor utiliza Node 26.4.0 incluido; Electron 44.3.0 mantiene su runtime separado. La aplicación no expone Node al renderer ni carga paquetes del motor en él.

## Snapshot requerido por el fuse

`LoadBrowserProcessSpecificV8Snapshot=true` cambia el nombre que Electron abre al iniciar el proceso principal a `browser_v8_context_snapshot.bin`. Activar el fuse no genera ese archivo. El paquete anterior fijaba el fuse pero no preparaba el archivo; la prueba del ejecutable final detectó una salida antes de crear la ventana.

El hardening conserva todos los fuses elegidos y prepara ese nombre usando una copia byte por byte de `v8_context_snapshot.bin` del MISMO runtime Electron empaquetado. Su hash se registra y ambos archivos forman parte del inventario de integridad. No se acepta un archivo de otra versión, una descarga independiente ni un enlace. No se afirma que copiar el snapshot stock mejore el rendimiento o añada aislamiento frente a usar esos mismos bytes en ambos procesos.

Referencia primaria: https://www.electronjs.org/docs/latest/tutorial/fuses

La prueba nativa del binario endurecido sigue siendo obligatoria: una tabla de fuses correcta por sí sola no demuestra que la aplicación arranque. Si una prueba falla, se conserva como fallo; no se desactivan fuses ni se instrumenta el binario distribuido para aparentar una aceptación.
