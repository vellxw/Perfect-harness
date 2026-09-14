# Compatibilidad de providers y auditoría

Base fijada: `@earendil-works/pi-coding-agent@0.85.1`, `@earendil-works/pi-ai@0.85.1`; Node 24. Los tipos instalados son autoridad sobre ejemplos antiguos.

## SDK realmente utilizado

`ModelRuntime.create`, resolución explícita `getModel(provider,id)`, `createAgentSession`, `customTools`, allowlist de nombres, `SessionManager`, `SettingsManager`, `DefaultResourceLoader` con overrides confiables, `session.prompt`, `subscribe`, `abort`, `dispose`. La extensión de interfaz es opcional. No se usa `continueSession` de comentarios obsoletos.

Se comprueba el nivel antes y después de crear la sesión para detectar el clamp de Pi. No se deja que Pi elija el primer modelo disponible ni restaure otra ruta silenciosamente.

## Catálogo vs cuenta

| Provider/modelo                          | Auth requerida         | Reasoning configurado |
| ---------------------------------------- | ---------------------- | --------------------- |
| xai/grok-4.6                             | OAuth de suscripción   | medium / xhigh        |
| openai-codex/gpt-6-astra                 | OAuth de ChatGPT/Codex | high / xhigh          |
| opencode/muse-spark-1.3-contributor-free | API key OpenCode Zen   | xhigh                 |

El catálogo 0.85.1 observado anuncia estas rutas. No demuestra acceso, cuota ni condiciones concretas de una cuenta. `doctor` informa catálogo/configuración; `doctor --online` puede resolver/renovar credenciales; solo `smoke` hace una inferencia.

Muse Free tiene `max: null` en el catálogo fijado. No enviar Max ni presentarlo como efectivo. Una actualización exige nueva evidencia y contrato/smoke de esa ruta. La API key de OpenCode no implica automáticamente cobro: se valida el modelo Free exacto. No se ejecuta un segundo harness OpenCode.

## Identidad en el transporte

Pi expone campos opcionales `responseModel`/`providerThinkingLevel`, pero los adaptadores Responses observados de 0.85.1 no preservan toda la metadata del sobre SSE. Por eso Perfect añade un `fetch` por sesión que observa únicamente metadata de eventos SSE antes de entregarlos a Pi. No modifica el fetch global ni confía en “soy el modelo X”.

`transport-audit.ts` soporta eventos `response.*` y chunks de completions, fragmentación UTF-8, CRLF, multiline y `[DONE]`, con límite por evento. Un modelo o esfuerzo reportado diferente aborta antes de aceptar el resultado/herramientas. Metadata ausente queda unknown. La procedencia `service-sse` indica una declaración del servicio, no verificación criptográfica de sus pesos internos.

V1 fija SSE; no cambia a WebSocket sin soporte equivalente de auditoría. Endpoints exactos y sin redirects de autenticación/inferencia no aprobados. No hay alias “equivalentes” implícitos. Un proveedor que solo devuelva un alias distinto requerirá compatibilidad explícita, no reducir la comprobación para aparentar éxito.

## Uso, fallos y coste

Input/output/cache/reasoning se registran cuando son observables; reasoning forma parte de output. Valores ausentes no se rellenan con cero. Se diferencia estimación monetaria de cargo reportado; una suscripción no se valora como factura API.

Retries acotados; `Retry-After` respeta segundos o fecha HTTP. Un cooldown largo pausa en vez de reintentar antes. OAuth/rate limit/cuota/modelo unavailable no generan tareas de reparación de UI. No se cambia a API key paga al fallar OAuth.

## Fuentes y revalidación

- https://github.com/earendil-works/pi/tree/v0.85.1
- https://pi.dev/docs/latest/sdk
- https://pi.dev/docs/latest/providers
- https://pi.dev/docs/latest/security
- https://pi.dev/models/xai/grok-4-6
- https://pi.dev/models/openai-codex/gpt-6-astra
- https://pi.dev/models/opencode/muse-spark-1-3-contributor-free
- https://opencode.ai/docs/zen/
- https://developers.openai.com/codex/auth/

Los documentos latest cambian: revisar también el código/tipos de la versión instalada al actualizar.
