# MCP, GitHub, navegador y escritorio Windows

Perfect incorpora una capa de integraciones propia sobre sus sesiones Pi. La interfaz permanece en español. Conectar un servicio no cambia las rutas de modelos, no habilita la carga de plugins del repositorio ni permite que una respuesta externa declare DONE.

## Configuración desde la interfaz

Abrí `/integraciones`. Podés configurar GitHub, habilitar el navegador, elegir una ventana de Windows, probar una conexión, revisar su catálogo y decidir permisos pendientes. Las conexiones son locales y pertenecen a la carpeta de trabajo. No se autoriza ningún programa automáticamente al abrir un repositorio.

### GitHub oficial

Escribí `/github propietario/repositorio`, revisá el alcance y confirmá `CONFIAR`. La conexión comienza en solo lectura. Elegí **Credencial local · github** para introducir un token personal mediante un campo enmascarado; no lo escribas como objetivo ni como argumento de un comando. Después elegí **Probar conexión y revisar**, inspeccioná el catálogo real y autorizá su huella mediante `CONECTAR`.

El destino es el servidor oficial `https://api.githubcopilot.com/mcp/`. Las herramientas se limitan al repositorio indicado. Se admiten lecturas de archivos, commits, issues, solicitudes de cambios y Actions. La amplitud del token no amplía la política de Perfect.

`/github propietario/repositorio escritura` permite proponer escrituras, pero cada llamada exige aprobación exacta. Se pueden crear ramas bajo `perfect/`, publicar archivos permitidos, abrir una solicitud de cambios y añadir comentarios. No se exponen fusionar, desplegar, borrar ni force-push. `.github` y los archivos sensibles están protegidos.

GitHub se considera privado inicialmente. No se expone a Muse Contributor y un objetivo público no puede leer una conexión privada. La CLI permite marcar explícitamente una conexión como pública únicamente cuando todo su contenido sea público.

```text
perfect integraciones github propietario/repositorio --confirmar CONFIAR
perfect integraciones clave github --clave-env MI_TOKEN_GITHUB
perfect integraciones probar github
perfect integraciones autorizar github --huella HUELLA_MOSTRADA --confirmar CONECTAR
```

`MI_TOKEN_GITHUB` es el nombre de una variable local, no su valor. Las credenciales se almacenan con DPAPI del usuario en Windows; en Linux se utiliza un archivo 0600 dentro de una carpeta 0700 (permisos, no cifrado de disco). Nunca se envían al modelo ni se guardan en el repositorio. MCP HTTP utiliza Bearer/PAT; no hay login OAuth MCP genérico ni herencia de las conexiones de ChatGPT.

### Servidores MCP generales

El SDK oficial TypeScript 2.0.0 proporciona stdio y Streamable HTTP. Perfect admite descubrimiento y validación de herramientas, recursos de texto acotados por URI, imágenes reales, cancelación y límites. Un cambio de catálogo requiere otra revisión. Las anotaciones remotas no conceden permisos: cada herramienta tiene clasificación local `read`, `write` o `interactive`.

```text
perfect integraciones agregar mi-servidor.json --confirmar CONFIAR
perfect integraciones probar mi-servidor
perfect integraciones autorizar mi-servidor --huella HUELLA_MOSTRADA --confirmar CONECTAR
```

Para stdio se exige una ruta absoluta a un ejecutable que revisaste. No se interpreta un shell, el entorno se reduce y solo se pasan credenciales referenciadas. **Un programa local sigue teniendo los permisos de tu usuario: limpiar su entorno no es un sandbox.** Perfect no instala paquetes sugeridos por un agente ni carga extensiones automáticamente.

HTTP requiere HTTPS, salvo loopback explícitamente autorizado. No se siguen redirecciones con credenciales ni se permite cambiar de origen/ruta durante una petición. Los esquemas externos no se descargan automáticamente. No se habilitan sampling, elicitation, SSE heredado ni prompts/skills remotos. Los ejemplos JSON no contienen claves.

### Navegador interactivo

`/navegador` habilita, tras `CONFIAR`, un navegador de la **aplicación aislada de esta tarea**. El agente puede iniciar el servidor, observar estructura accesible, completar campos, pulsar controles, desplazarse, cambiar de tamaño, leer consola y capturar píxeles reales.

La aplicación y el navegador viven en contenedores separados con red interna de Docker. El navegador no recibe el repositorio ni las credenciales. No usa tu Chrome personal, no navega por Internet y no expone JavaScript arbitrario, carga/descarga de archivos o contraseñas. Las escrituras de ejecución no se importan al código fuente. Se reutiliza la preparación aprobada de dependencias de Perfect.

Las acciones requieren referencias de elementos y una observación vigente; elementos modificados u observaciones antiguas obligan a mirar de nuevo. Los reportes y capturas se guardan como observaciones del controlador, **no como verificaciones suficientes por sí mismas**. Playwright y el evaluador independiente siguen validando el candidato.

Un navegador externo puede conectarse como MCP general autorizado, pero no hereda las garantías del navegador integrado.

### Escritorio Windows

El paquete incluye Microsoft WinApp CLI 0.6.0 y comprobadores propios de identidad, privacidad y parada de emergencia. Se descarga la dependencia oficial mediante una versión y SHA-256 fijos; no se distribuye su PDB.

Abrí una aplicación de prueba y escribí `/escritorio`. Elegí una ventana visible no elevada y confirmá `CONTROLAR`. La autorización vincula HWND, PID, inicio del proceso, ejecutable y nonce de ventana. Tiene vencimiento (diez minutos por defecto) y un máximo de cincuenta acciones.

El agente puede inspeccionar y capturar esa ventana. Clics, escritura e interacciones requieren aprobación por llamada. No se aceptan coordenadas libres, atajos del sistema, PowerShell ni herramientas del registro. Terminales, aplicaciones elevadas y otras ventanas o diálogos quedan fuera del permiso. Los controles se vuelven a verificar antes de actuar.

**Ctrl+Alt+F10 detiene el control.** Un proceso independiente reserva esta combinación durante una sesión activa. Si no puede reservarla o hay otro agente controlando Windows, se bloquea el inicio. `/detener-escritorio` revoca los permisos de la carpeta. El cierre, reemplazo o expiración de la ventana no traslada el permiso a otra.

Solo se admite un agente de escritorio a la vez. El contenido se considera privado y nunca se envía a Contributor. Elegir una ventana puede revelar su contenido: usá aplicaciones de prueba o una máquina virtual, no ventanas con datos sensibles. La selección de ventana no es un sandbox completo de la aplicación. La función se ejecuta en Windows, no dentro de WSL ni del contenedor Linux.

Durante las pruebas se detectó que WinApp 0.6.0 deriva su `IsPassword` textual del tipo Edit. Perfect consulta por separado la propiedad real `AutomationElement.Current.IsPassword`; un control privado o no verificable se bloquea. No se quitó la protección para hacer pasar la prueba.

## Aprobaciones y recuperación

El panel muestra herramienta, agente, ejecución, argumentos completos, vencimiento y huella. `AUTORIZAR` permite solo esa llamada. Cambiar configuración o catálogo invalida la autorización; el modelo no recibe herramientas para aprobarse a sí mismo.

Una escritura idéntica completada no se reenvía al repetir el turno o replantear. Una interrupción después del envío deja un resultado incierto y bloquea nuevas escrituras de ese ámbito; no se reintenta a ciegas. Las lecturas permiten investigar el resultado.

```text
perfect integraciones pendientes
perfect integraciones inspeccionar ID_OPERACION
perfect integraciones rechazar ID_OPERACION --huella HUELLA
perfect integraciones reconciliar ID_OPERACION --huella HUELLA --confirmar NO_EJECUTADO
perfect integraciones recuperar-navegador
```

`NO_EJECUTADO` requiere revisar primero el servicio y confirmar que la acción no ocurrió. No lo uses para saltarte una incertidumbre. Conexiones, permisos e historial permanecen fuera del repositorio en `integrations.sqlite`; las evidencias pertenecen a su ejecución.

## Pruebas y límites

Hay contratos con Pi AgentSession real y MCP stdio/HTTP real contra servicios sintéticos, pruebas de ámbito GitHub, permisos, revocación, repeticiones, referencias y UI. Los E2E Docker usan navegador, API y base de datos reales. Windows usa una ventana WinForms con token de integridad media y comprueba UIA, identidad, captura y revocación sin relajar la exclusión de procesos elevados.

El estado exacto de CI y los artifacts del commit determinan qué pasó. No se usan cuentas personales en CI. Las pruebas de Windows Server 2025 no certifican todas las aplicaciones de Windows 11. El instalador sigue sin firma Authenticode.
