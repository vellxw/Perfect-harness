# Autenticación local

Ejecutar `perfect login xai`, `perfect login openai-codex` y `perfect login opencode` desde un workspace confiable. El login de xAI usa el flujo de dispositivo de Pi; Codex usa OAuth de cuenta ChatGPT; OpenCode requiere API key de Zen. Perfect no extrae cookies ni implementa un login web alternativo.

Las cuentas se guardan por `accountRef`, fuera del proyecto, bajo el home de Perfect. Backend/Oracle comparten el semáforo de `chatgpt-personal`; Planner/general/visual/integrator comparten el de `xai-personal`. Tener varios roles no multiplica una suscripción.

`--account` permite elegir la referencia configurada. Para API keys, `--key-env VARIABLE` evita argumentos con el token. No dejar variables en `.env` versionados, no copiar auth.json a CI y no pegar tokens en el chat.

`doctor` no infiere; `doctor --online` puede resolver/renovar una credencial. Un refresh exitoso no demuestra que el modelo acepte inferencias. `smoke --role backend` prueba un binding mínimo. `smoke --allow-contributor` usa exclusivamente contenido sintético de prueba para el permiso Contributor.

Para código real, Contributor exige `consent-contributor --yes` por workspace y una goal `--public`. Revisar privacidad antes de autorizar. Revocación con `consent-contributor --revoke`; ninguna revocación puede retirar prompts ya enviados al proveedor.

No guardar secretos reales en fixtures. En GitHub Actions todos los providers son simulados; los contratos de Pi usan un servidor local con respuestas SSE sintéticas y una key de prueba sin valor.
