# Remotion

Para una goal cuyo proyecto contiene `remotion`, `@remotion/bundler` y `@remotion/renderer` en versiones compatibles, preparar explícitamente dependencias con `perfect prepare <goal-id> --render --allow-network`. El plan debe incluir verificación de tipo `remotion` con entry, compositionId, frames, dimensiones, FPS, duración y si debe producir video.

El ejemplo ejecutable aislado está en `tests/e2e/remotion.test.ts`. No requiere credenciales de modelos. Renderiza y verifica frames + H.264 en el sandbox. La licencia de Remotion se revisa por separado.
