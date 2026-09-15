# Unity en Perfect

Integración de terceros: https://github.com/isuzu-shiranui/UnityMCP, commit revisado 65a45acecddf91236024bef080fdc946195d029a, licencia MIT. No es un servicio de Unity Technologies. La licencia del editor y la confianza en el código del proyecto son independientes.

1. Instalá el paquete del editor en una COPIA administrada autorizada del proyecto, fijando el commit. No uses instaladores remotos por pipe. Abrí el proyecto con la versión de Unity correspondiente.
2. Elegí el descriptor que publica ese Editor en UnityMCP/instances. `perfect unity inspeccionar <archivo>` muestra proyecto/PID/endpoint y fingerprint, nunca el token.
3. Registrá la conexión con `perfect unity conectar <archivo> <fingerprint> --perfiles gameplay,game-assets,game-critic --confirmar "CONFIAR PROYECTO"`. La lectura es predeterminada. `--editar` solo permite solicitar escrituras concretas con aprobación; no las autoriza por adelantado.
4. Ingresá el Bearer del Editor como credencial local PERFECT_UNITY_TOKEN desde /integraciones. No se extrae ni copia automáticamente a configuraciones. Probá la conexión y revisá su catálogo.
5. Asigná tareas a los perfiles autorizados. La escritura exige que el Editor tenga abierta la copia administrada EXACTA de esa tarea y que esta posea Assets en exclusiva. Un lock compartido impide dos escritores. La carpeta original no se edita por el mero hecho de estar abierta.

El token, proceso y descriptor deben seguir coincidiendo. Reiniciar el Editor requiere reconciliar escrituras inciertas y volver a autorizar. No se expone loopback a Internet para resolver WSL: ejecutá el controlador en Windows junto al Editor cuando corresponda.

La allowlist del cliente se comprueba en CADA llamada. El filtro de grupos del servidor solo modifica tools/list y no es autorización. execute_code, menu_execute, reflexión, herramientas definidas y borrados no se habilitan. Se prefieren capturas renderizadas game/scene; no paneles que puedan incluir otra aplicación.

Una sesión Unity ejecuta código C# del proyecto con privilegios del usuario. Ni una copia Git ni el bloqueo de execute_code constituyen sandbox: no abrir proyectos no confiables. Undo tampoco reemplaza checkpoints. Las pruebas MCP sintéticas no certifican un Editor real ni un juego exportado; ejecutá compilación, Play Mode, tests instalados y build del proyecto antes de aceptarlo.

Si una escritura quedó incierta, el lock se conserva. Revisá manualmente el Editor y las operaciones desde /integraciones antes de retirar un lock; Perfect no lo roba por tiempo ni repite la escritura.
