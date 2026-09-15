# Perfect Harness V4

Un harness local sobre Pi SDK con interfaz de terminal en español: objetivo → planificación → agentes especializados → implementación → verificación → reparación → Judge. La UI no decide que una tarea está terminada.

**V4:** habilidades por equipos y perfiles, selección manual por versión, creador guiado, evaluación A/B aislada, Blender verificable y validación local de capacidades. [Guía completa de V4](docs/v4-user-guide.md).

## Instalar

Windows x64: descargar **Perfect-Harness-Setup-x64.exe** o el **portable completo** desde [GitHub Releases](https://github.com/vellxw/Perfect-harness/releases). El workflow de publicación exige que Linux, Windows, Docker, Blender, UI e instalación/actualización aprueben para el mismo commit antes de publicar. Si todavía no aparece una release, consultar el [workflow de publicación](https://github.com/vellxw/Perfect-harness/actions/workflows/v4-release.yml), no instalar un artifact fallido como si fuera una entrega verificada.

Cada release incluye versión, commit, SHA256, manifiesto e informes de prueba. No copiar solamente Perfect.exe: necesita su runtime y módulos incluidos. El ejecutable está sin firma Authenticode; no desactivar protecciones del sistema. Pausar y cerrar Perfect antes de actualizar; la instalación no actualiza automáticamente tus cuentas ni ejecuta objetivos.

Desde el código, con Node 26.4.x y Git:

```sh
git clone https://github.com/vellxw/Perfect-harness.git
cd Perfect-harness
npm ci
npm run build
npm link
perfect
```

La CLI y `--json` siguen disponibles. Los trabajos de código requieren Docker con contenedores Linux y los proveedores configurados. La interfaz/demostración no requiere cuentas:

```sh
perfect --demo running
perfect --demo repair
perfect doctor
```

## Habilidades y equipos

`/habilidades` permite apagar todo, usar selección manual o selección automática dentro de los equipos autorizados. **Manual vacío significa cero skills.** Las selecciones fijan versión/hash; una actualización no hereda autorización. Las exclusiones de equipo o perfil prevalecen sobre una asignación global. Desactivar invalida sesiones y cancela operaciones afectadas; para retirar instrucciones ya leídas se inicia una sesión nueva conservando checkpoints.

`/equipos`, `/perfiles` y `/modos` separan conocimientos, responsabilidades y modelo. Cambiar proveedor/modelo/reasoning no amplía herramientas ni cambia los equipos. Superpowers está desactivado por defecto. No se utiliza Supabase; los backends nuevos que necesitan persistencia usan PostgreSQL directo y servicio propio. El estado de Perfect permanece en SQLite.

## Crear y comprobar skills

`/crear-skill` abre un formulario. La goal del autor produce un paquete, el Judge verifica sus entregables y **Recopilar borrador** lo pone en cuarentena. Inspección, evaluación, aprobación de producción y selección son decisiones distintas. Un borrador se puede evaluar sin activarlo en otros agentes.

`/evaluaciones` muestra comparaciones RESPONSE o CODE con sesiones/workspaces independientes. Los criterios del controlador no son archivos editables por el agente. Una prueba donde ambos fallan no es calidad aprobada; una donde ambos pasan no demuestra superioridad. Proponer no consume inferencias; ejecutar exige permiso y límites agregados. Los tests con providers sintéticos validan el sistema, no la calidad de los modelos personales.

## Motion, juegos y Blender

`/motion` y `/juegos` reutilizan el orquestador, no añaden otro harness. Blender crea una fuente editable en un sandbox; otro proceso la reabre, exporta GLB y produce un render. Three.js/Chromium comprueba la carga del asset y la imagen. No se declara `DONE` por un nombre de archivo o un reporte escrito por el creador.

Preparación explícita desde este checkout:

```sh
node scripts/prepare-blender.mjs --allow-network
perfect validacion blender --yes
```

No se instala Blender ni ningún editor comercial automáticamente con Perfect. Unity tiene un [preset MCP controlado](docs/unity.md), no una certificación de todos los proyectos. AE/Rive/Cavalry e imagen generativa se muestran como no implementados cuando falta su adaptador, no como cuentas sin configurar. Dashi permanece pendiente de licencia; Transitions gratuito se importa localmente según sus términos y no se redistribuye como colección. Beam usa la biblioteca pública, sin contenido Pro.

## Validación y cuentas

`/validacion` separa implementado, detectado, configurado, autorizado, autenticado, invocado y verificado. El diagnóstico no hace inferencias. Las pruebas reales son locales, explícitas y limitadas. Los tokens nunca se ingresan por chat ni se copian a GitHub.

```sh
perfect login xai
perfect login openai-codex
perfect login opencode
perfect validacion
perfect validacion perfil backend --yes
perfect validacion exportar
```

La conexión de GitHub de una conversación no se transfiere al producto. Consultar [integraciones y permisos](docs/integraciones.md).

## Pruebas y procedencia

CI permanente: Linux/Windows nativo, Docker E2E, Blender real, UI y distribución Windows con instalación/actualización/desinstalación. Consultar los resultados del **commit exacto**, no el color de una revisión anterior. Los jobs ligeros omiten los E2E que ejecutan los jobs especializados. Los artifacts distinguen modelos sintéticos, renderizador nativo y capturas del escritorio.

Windows CI utiliza Windows Server 2025; no implica una prueba personal de Windows 11, Docker Desktop ni OAuth del usuario. Las PRs se fusionan por decisión del propietario. Los commits de main pueden publicar una release únicamente después de superar las comprobaciones; los objetivos ejecutados por el producto conservan sus permisos y no obtienen autorización de despliegue por esta automatización del repositorio.

[Seguridad](SECURITY.md) · [Diseño](docs/design/perfect-v2.md) · [Guía V4](docs/v4-user-guide.md) · [Descargas](https://github.com/vellxw/Perfect-harness/releases)
