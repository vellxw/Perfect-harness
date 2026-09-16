# Seguimiento de rendimiento: carga diferida de integraciones

El run 35122565470 del commit 41faab50928c4cf0994131894339fa765ac33e3a aprobó núcleo Linux/Windows, TUI, recorridos Desktop, Goal Loop, Blender y distribución Windows. El benchmark FULL terminó sus cinco minutos idle y treinta minutos de sesión, pero rechazó arranque frío p95 2161,37 ms (límite 2000 ms) y memoria atribuida p95 450,8125 MiB (límite 450 MiB). Se conserva ese resultado como fallo; no se eliminó la primera muestra ni se aumentaron los límites.

La lista local de conexiones inicializaba indirectamente transportes MCP, controladores browser/desktop y código de credenciales por imports de IntegrationAdmin, aun sin abrir ni ejecutar esas capacidades. Ahora se cargan en la operación correspondiente. La base de permisos, recuperación de operaciones interrumpidas, catálogo, autorizaciones y revocaciones siguen siendo las mismas. Una señal abortada no impide revocar un permiso ya concedido.

La regresión observa imports reales en un proceso Node independiente y comprueba refresh, snapshot, revocación vacía y rechazo de una inferencia de conexión cancelada antes de cargar transportes. No sustituye los contratos e integración existentes. La reducción de memoria/arranque debe medirse en la nueva ejecución FULL: este cambio no declara por sí solo cumplidos los objetivos.
