# Verificación funcional y visual

Cada resultado tiene spec, revisión, código de salida, tiempos, hash de entorno y evidence IDs. El runner captura stdout/stderr; el worker no escribe un results.json que luego se acepte como prueba. Los artifacts se hashean y comprueban antes del Judge y de enviarlos como contexto.

Comandos: typecheck, build, lint y tests se definen en el contrato del plan; no se asume que cualquier repo tenga los mismos scripts. Se captura baseline antes de implementar. La suite final se ejecuta sobre el candidato integrado, no solo sobre un worktree aislado. Los tests/referencias existentes no pueden ser reescritos por workers para hacer pasar la tarea.

## Browser

Playwright 1.63.0 + Chromium de la imagen fijada. Servidor y browser separados en red Docker interna. Viewports, locale, timezone y escala reproducibles. El driver espera salud, abre la app, ejecuta acciones, registra consola, mide overflow y captura screenshots/traces. El target es una imagen real; su hash se preserva.

Las métricas de píxeles son apoyo y se entregan a una review visual independiente. No garantizan parecido semántico. Sin una imagen/brief suficientemente preciso, no inventar un target. Criterios visuales pueden exigir aprobación humana.

## Motion / Remotion

Un `VisualScenario` puede especificar frames y una app con `window.__perfectSeek(frame)` para capturas controladas de GSAP/WebGL. No alcanza con inspeccionar el último frame para declarar fluidez.

El verificador Remotion utiliza @remotion/bundler y @remotion/renderer **del proyecto**, preparados con `perfect prepare --render --allow-network`. No importa código del proyecto en el proceso de credenciales. Usa un Chrome existente en la imagen, renderiza los frames solicitados y opcionalmente H.264, y valida width/height/FPS/duración contra la especificación y metadata del video. Los frames y targets se suministran al reviewer.

La prueba E2E usa un fixture de dos segundos con posición dependiente del frame y comprueba tres imágenes diferentes más un video real. No sustituye una evaluación perceptual de cada video de usuario. Audio, ritmo musical y continuidad perceptual completa no tienen una certificación automática en V1.

## Referencias técnicas

https://playwright.dev/docs/test-snapshots
https://playwright.dev/docs/trace-viewer
https://www.remotion.dev/docs/renderer/render-still
https://www.remotion.dev/docs/renderer/render-media

Mantener consistente la versión de @remotion/renderer/bundler/remotion del proyecto. Remotion tiene condiciones de licencia propias.
