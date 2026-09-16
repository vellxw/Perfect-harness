# Publicación Desktop V5

El publicador V4 quedó read-only y ya no publica en push a main. V5 no se publica al abrir una PR ni simplemente al terminar un build.

1. El candidato de rama debe aprobar los gates. Revisar capturas y videos reales antes de la fusión; generación/decodificación automática no es aprobación visual.
2. Fusionar con autorización y conservar la release V4. El pipeline v5-acceptance se ejecuta sobre el SHA real de main, construye y prueba los binarios finales e integra la evidencia de los siete gates.
3. Inspeccionar los bytes finales. Publicar en PR #5 un comentario del propietario con el marcador `<!-- perfect-desktop-visual-review:v1 -->` y un solo bloque JSON conforme a `parseVisualReview` en `scripts/desktop/release-policy.mjs`. Debe identificar SHA, run, artifact/hash, verdict, notas y todos los videos más al menos ocho screenshots con sus hashes.
4. El evento del comentario (o workflow_dispatch con sus IDs) inicia v5-publish. Se comprueba main actual, ejecución de aceptación, revisión real del propietario y cada archivo. Se crea una release borrador, se suben exactamente los archivos probados, se vuelven a descargar/verificar y solo después se publica. No se reemplazan tags ni releases estables existentes.
5. El publicador descarga otra vez los enlaces públicos sin autenticación. Un job Windows read-only vuelve a descargar instalador/portable y ejecuta el GUI endurecido y la CLI incluidos mediante input nativo bajo token no administrativo. Si falla, un job acotado devuelve ese candidato a borrador, sin mover tags ni reemplazar archivos.

El estado final exigido es `PUBLISHED_PUBLIC_HASH_AND_NATIVE_SMOKE_VERIFIED`, no solo “release created”. Los informes de publicación y de smoke quedan como artifacts del workflow; cada paso conserva procedencia y errores.

No se puede escribir una aprobación visual si quien actúa no vio las imágenes y los videos pertinentes. Un entorno incapaz de abrir esos archivos es un bloqueo de revisión, no un permiso para marcarla aprobada. Los límites de cuentas, firma Authenticode, Windows 11 personal y editores siguen documentados separadamente.
