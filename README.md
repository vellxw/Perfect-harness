# Perfect Harness

Un coding-agent harness local sobre **Pi SDK**: planificación multiagente, cambios aislados, verificación ejecutada y un Judge determinista. No es una extensión gigante ni una cadena fija de prompts.

```text
goal → descubrir → plan/DAG → workers en paralelo → integrar
     → verificar → revisar → Judge → DONE
                  ↳ reparar / replantear / pausar
```

**Un agente no puede declarar DONE.** Deben pasar los criterios y verificaciones del plan aprobado, sobre el candidato integrado actual, con evidencia íntegra y las revisiones exigidas. `PAUSED` conserva trabajo y explica qué falta; no equivale a éxito.

## Instalación

V1 validada en Linux/WSL2, con **Node 24**, Git y Docker. Ejecutar con un usuario normal, no con `sudo`. No requiere una instalación global adicional de Pi.

```sh
git clone --branch feat/perfect-harness-v1 https://github.com/vellxw/Perfect-harness.git
cd Perfect-harness
npm ci
npm run build
npm link
perfect --version
```

Preparar explícitamente las imágenes de ejecución:

```sh
docker pull node:24-bookworm-slim
docker pull mcr.microsoft.com/playwright:v1.63.0-noble
perfect doctor
```

`doctor` diagnostica; no instala herramientas, no abre una sesión de inferencia y no llama a un modelo. Sin Docker, la ejecución de comandos se bloquea: **no existe un fallback a shell del host**. Las imágenes se resuelven a un ID inmutable al ejecutarlas.

### Primero: demostrar el loop sin cuentas

```sh
perfect smoke --fullstack --mock --accept-plan
```

El ejemplo temporal construye una miniapp de reservas con API, SQLite y UI. Los **providers y reviews son simulados e identificados como `perfect-mock`**; Git, ownership, comandos aislados, API, persistencia, navegador, capturas y Judge son reales. El primer frontend tiene un desborde móvil deliberado: su verificación sintáctica pasa, el navegador lo rechaza y una repair recibe capturas para corregirlo. El origen no se modifica.

### Después: autenticar las rutas reales

```sh
perfect login xai
perfect login openai-codex
perfect login opencode
perfect doctor --online
perfect smoke --allow-contributor
```

Los logins usan las rutas de autenticación de Pi. Para una API key, el comando la solicita sin mostrarla; alternativamente `--key-env NOMBRE_DE_VARIABLE`. No pasar tokens como argumentos, pegarlos en issues ni subirlos a GitHub. El permiso Contributor del smoke solo autoriza datos sintéticos de diagnóstico, no el código de tu proyecto.

| Rol                           | Provider / modelo solicitado               | Reasoning |
| ----------------------------- | ------------------------------------------ | --------- |
| Planner                       | `xai/grok-4.6`                             | `xhigh`   |
| General / integrator          | `xai/grok-4.6`                             | `medium`  |
| Frontend                      | `opencode/muse-spark-1.3-contributor-free` | `xhigh`   |
| Backend                       | `openai-codex/gpt-6-astra`                 | `high`    |
| Oracle, read-only             | `openai-codex/gpt-6-astra`                 | `xhigh`   |
| Revisión visual independiente | `xai/grok-4.6`                             | `medium`  |

Son bindings explícitos del producto, **no una afirmación de que tus cuentas ya fueron probadas**. Muse Free no se etiqueta Max: el catálogo fijado declara `max: null`. No se cambia de proveedor, modelo, reasoning o modalidad de cobro silenciosamente. [Compatibilidad y auditoría](docs/provider-compatibility.md).

## Trabajar sobre un proyecto

```sh
cd /ruta/a/mi-proyecto
perfect init
perfect goal "Implementá la funcionalidad y demostrá que cumple sus criterios"
perfect plan
perfect approve-plan
perfect resume
```

Por defecto la goal es privada y exige aprobación del plan. **La ruta Contributor se bloqueará para una tarea privada/confidencial**, sin sustituirse por una ruta de pago. Para un workspace que realmente pueda compartirse con esa modalidad, después de revisar las condiciones de entrenamiento:

```sh
perfect consent-contributor --yes
perfect goal --public "Construí una landing responsive con verificación visual"
```

Ambas autorizaciones son necesarias: consentimiento del workspace y clasificación pública. Una task puede elevar la clasificación, nunca reducirla. `perfect consent-contributor --revoke` detiene nuevas solicitudes a Contributor; no revierte información ya enviada.

### Comandos principales

```sh
perfect status --watch
perfect tasks
perfect agents
perfect routing
perfect cost
perfect logs --follow
perfect pause
perfect resume
perfect abort
perfect retry <task-id>
perfect diff
perfect apply --yes
```

`apply` requiere DONE y que tanto el origen como el candidato sigan intactos. Aplica solo el delta verificado: no hace commit ni push en el repositorio original. No se hace stash/reset del trabajo del usuario. Si hay divergencia o una operación previa incierta, se detiene. Las goals terminales son inmutables; `retry` no resetea límites.

`perfect shell` admite `/goal`, `/status`, `/plan`, `/tasks`, `/agents`, `/routing`, `/cost`, `/pause`, `/resume`, `/abort`, `/retry` y `/logs`. `--home`, `--workspace` y `--json` están disponibles en la CLI. Códigos: `0` éxito, `2` bloqueo/pausa, `3` goal fallida y `130` abortada.

La extensión opcional se carga desde `dist/pi-extension/index.js` en una instalación compatible de Pi. Expone `/goal` y `/perfect <comando>`; no reemplaza el `/resume` propio de Pi. Autenticación, consentimiento y apply se hacen en la CLI, no en la extensión.

### Dependencias de un proyecto

El sandbox no hereda `node_modules`, `.npmrc` ni credenciales del host. Si el proyecto necesita paquetes, la goal puede pausar para una preparación explícita:

```sh
perfect prepare <goal-id> --allow-network
perfect resume <goal-id>
```

Para los manifiestos de una task pausada, agregar `--task <task-id>`; esa task debe tener ownership del lockfile. Para Remotion, `--render`. La preparación usa solo el registro público npm, sin lifecycle scripts, y guarda hashes de manifests/lockfile e ID de imagen. Verificaciones posteriores funcionan sin salida a Internet. [Seguridad y límites](SECURITY.md).

## Configuración y estado

`perfect.config.json` es JSON estricto, con [schema](perfect.config.schema.json) y [ejemplo](perfect.config.example.json). Editar y luego ejecutar `perfect trust-config --yes` tras revisar el contenido. Cambiar un archivo del repo no amplía permisos automáticamente. Cada goal conserva un snapshot de su configuración; cambios posteriores se aplican a nuevas goals.

Estado local en `~/.local/share/perfect-harness` o `PERFECT_HOME`: SQLite, eventos, sesiones Pi, repositorios administrados y artifacts. Credenciales separadas por referencia de cuenta, fuera del source y de los contenedores. No se monta una base de datos de red.

Defaults: 4 agentes, 2 escritores, 2 workers generales; xAI 2 por cuenta, Codex 1, Muse 1; 10 iteraciones, hasta 3 intentos por linaje, 8 invocaciones del Planner y 3 del Oracle. Presupuesto `warn`, rutas pay-per-token deshabilitadas. Uso desconocido se conserva como desconocido, no como cero. [Arquitectura](docs/architecture.md) · [Loop](docs/goal-loop.md) · [Recuperación](docs/recovery.md).

## Desarrollo y pruebas

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:package
PERFECT_TEST_DOCKER=1 npm run test:e2e
```

`npm test` incluye contratos que atraviesan **Pi SDK real contra un servidor SSE falso**, sin cuentas. Los dos tests Docker se omiten localmente si no está activado `PERFECT_TEST_DOCKER`; el job Docker de CI los exige y falla si Docker no está disponible. Ese job verifica fullstack/repair y render de frames/video Remotion. CI nunca tiene OAuth personal. [Guía de validación](docs/validation.md).

## Límites de V1

No es una prueba formal de corrección ni una certificación de seguridad. Los modelos y las reviews pueden equivocarse. Linux/WSL2 es la plataforma de ejecución probada; no hay soporte certificado de macOS/Windows nativo. La preparación npm es de un manifiesto raíz, no soporta registries privados ni ejecutar scripts nativos de instalación. Tests/referencias ya existentes están congelados para workers. No hay despliegues, push remoto automático, coordinación distribuida ni recolección automática de artifacts.

Los smoke de tus cuentas y la cuota efectiva se validan en tu PC. La CI demuestra la lógica del harness, no que una suscripción tenga acceso. Remotion es una dependencia opcional del proyecto renderizado y conserva su propia licencia; no se relicencia por el MIT de Perfect.
