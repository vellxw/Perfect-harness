# Perfect Desktop

Una aplicación gráfica local, en español, para trabajar con agentes de programación y revisar lo que producen. **Objetivo → plan → agentes → implementación → pruebas → reparación → Judge.** La interfaz no decide que el trabajo está terminado: el controlador exige evidencia del candidato actual.

Desktop 0.5.x conserva el motor Perfect V4 y su CLI/TUI. El doble clic en `Perfect.exe` abre una ventana normal, no Windows Terminal. Los modelos, las skills y los permisos siguen siendo configurables e independientes.

## Instalar y actualizar

Elegí una release **Desktop 0.5.x** en [GitHub Releases](https://github.com/vellxw/Perfect-harness/releases). La versión 0.4.x corresponde a la interfaz anterior de terminal. Una rama, un artifact intermedio o un workflow aprobado parcialmente no equivalen a una release estable.

- **Instalador Windows x64:** `Perfect-Harness-Setup-x64.exe`.
- **Portable:** extraé completa la carpeta de `Perfect-Harness-Windows-x64.zip`; no copies únicamente el ejecutable.

Antes de actualizar, pausá los objetivos activos y cerrá Perfect. El instalador es por usuario y conserva el estado fuera de la carpeta de instalación. Node y las dependencias del motor están incluidos; la GUI no necesita Node global, npm ni Windows Terminal. Docker y los editores externos se configuran aparte cuando el trabajo los requiere.

Las entregas incluyen versión, commit, hashes, manifiesto e informes de prueba. Los ejecutables de Perfect no llevan firma Authenticode mientras no se configure un certificado del editor. SHA256 verifica integridad, no identidad: no desactives SmartScreen ni Defender.

[Guía Desktop](docs/desktop/user-guide.md) · [Descargas](https://github.com/vellxw/Perfect-harness/releases) · [Seguridad](SECURITY.md)

## Primer uso

Abrí Perfect y elegí una carpeta de proyecto con el selector. Mientras el motor restaura el estado podés escribir un borrador; enviar permanece deshabilitado y no se crea una goal automáticamente. El borrador no enviado vive solamente en memoria. Los objetivos ya creados, sus checkpoints y preferencias se conservan en el almacenamiento local.

Usá **Habilidades**, **Equipos**, **Perfiles y modelos** y **Modos** para configurar quién trabaja y qué conocimientos recibe. Desde el composer describí el resultado y, cuando corresponda, adjuntá referencias. La privacidad es privada por defecto.

**Plan**, **Tareas**, **Verificación**, **Cambios** y **Resultados** muestran el trabajo. Las aprobaciones requieren la confirmación concreta; un doble clic no concede permiso para repetir una operación. Aplicar el resultado comprueba divergencia de la carpeta original y utiliza el candidato verificado.

La paleta **Explorar / Ctrl+K** da acceso a las secciones menos frecuentes. El recorrido principal se puede realizar con mouse y también con teclado.

## Skills, equipos y modelos

**Manual vacío significa cero skills.** Las selecciones fijan versión y hash. Una actualización no hereda aprobación; una exclusión de equipo o perfil prevalece sobre disponibilidad global. Global significa disponible, no cargada siempre. Apagar el sistema revoca nuevas cargas y exige una sesión limpia para retirar instrucciones que el agente ya leyó.

Los equipos separan conocimientos; los perfiles separan responsabilidades y modelos. Dos perfiles pueden usar el mismo modelo sin compartir skills. Cambiar proveedor, cuenta, modelo o reasoning no amplía permisos ni reetiqueta ejecuciones anteriores. La metadata que un proveedor no confirma permanece desconocida.

Superpowers está desactivado por defecto. No se utiliza Supabase. Las aplicaciones nuevas que necesitan backend persistente usan PostgreSQL directo y servicio propio; no se agrega servidor a una landing estática o juego offline. El estado de Perfect conserva SQLite local.

El creador produce un paquete revisable, no una habilidad autoaprobada. La recopilación entra en cuarentena y las evaluaciones RESPONSE/CODE utilizan sesiones y carpetas independientes. Si ambas condiciones fallan, no hay calidad aprobada; si ambas pasan, eso por sí solo no prueba mejora. Las inferencias de evaluación son explícitas y limitadas.

## Resultados, motion y juegos

Los visores permiten inspeccionar imágenes, reproducir video y abrir GLB compatibles. Las referencias del usuario se identifican por hash y no se confunden con capturas del producto. El preview web utiliza una superficie separada, sin acceso al bridge privilegiado ni al perfil personal del navegador.

Motion Studio y Game Creator reutilizan el orquestador existente. Blender puede crear una fuente editable en sandbox, reabrirla en otro proceso, exportar GLB y verificar su carga/render en un runtime real. Preparar Blender es una acción independiente; el instalador no descarga editores pesados ni compra licencias.

Unity tiene un [preset MCP controlado](docs/unity.md). After Effects, Rive, Cavalry y generación de imágenes se identifican como no implementados cuando falta su adaptador, no como una cuenta sin conectar. Dashi permanece pendiente de licencia; Transitions gratuito se importa localmente según sus términos. Beam usa la biblioteca pública, sin contenido Pro.

## Cuentas y validación local

**Validación local** diferencia implementado, detectado, configurado, autorizado, autenticado, invocado y verificado. El diagnóstico no hace inferencias por defecto. Las pruebas reales requieren autorización y límites. La conexión a GitHub de esta conversación no se transfiere al producto.

No pegues tokens en chats ni los subas al repositorio. Configuralos localmente en los controles de proveedores o integraciones. Las rutas Contributor requieren consentimiento y datos apropiados; no son una opción silenciosa para código privado.

Las demostraciones del Goal Loop están explícitamente etiquetadas: el motor, los archivos y los verificadores son reales, pero sus decisiones de provider son sintéticas. No prueban que tus cuentas personales puedan utilizar un modelo.

## CLI/TUI y desarrollo

La distribución Windows separa `Perfect.exe` (GUI) y `bin\perfect.cmd` (CLI). El PATH administrado apunta a `bin`, evitando la colisión de nombres en Windows. Los comandos anteriores se conservan:

```sh
perfect desktop
perfect status --json
perfect doctor
perfect
```

Desde un checkout de V5, con Git y Node 26.4.x:

```sh
npm ci
node node_modules/electron/install.js
npm run build:desktop
npm link
perfect desktop
```

La instalación explícita de Electron prepara el runtime de desarrollo; los binarios distribuidos ya lo incluyen. El motor usa su Node separado, no el Node embebido de Electron. Abrir la UI o el diagnóstico offline no implica cargar todas las cuentas/modelos.

## Pruebas, evidencia y publicación

[La matriz de aceptación](docs/desktop/acceptance.md) define los requisitos. El pipeline ejecuta regresiones del motor, Linux/Windows, Desktop, Docker, Blender, Goal Loop, rendimiento prolongado e instalación/actualización/desinstalación. Los casos pesados se ejecutan en sus jobs correspondientes; sus omisiones en una suite ligera no cuentan como aprobación.

Las capturas y grabaciones conservan método, plataforma, commit y hashes. Generarlas o decodificarlas no constituye inspección estética: la publicación estable exige además una revisión de los archivos exactos. El publicador V4 ya no publica automáticamente en `main`.

[Procedimiento de publicación](docs/desktop/release-procedure.md) · [Calidad y límites de medición](docs/desktop/quality-and-evidence.md) · [Integraciones](docs/integraciones.md) · [Guía de capacidades V4](docs/v4-user-guide.md)

La plataforma Windows de CI es Windows Server 2025; no representa una prueba en tu Windows 11 personal, Docker Desktop o tus editores. Esas validaciones siguen siendo locales e independientes de las pruebas automatizadas del software.
