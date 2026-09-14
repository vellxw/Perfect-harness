# Máquina de estados y aceptación

`RECEIVED → UNDERSTAND → DISCOVER → PLAN → DECOMPOSE → ASSIGN → EXECUTE → VERIFY → REVIEW → JUDGE → DONE`.

Son estados del controlador; las tasks tienen sus propios estados concurrentes. Una propuesta del LLM se valida y persiste; no puede mutar la goal directamente. `PLAN` usa Grok X-High para arquitectura y criterios; el scheduler ejecuta asignaciones mecánicas sin llamar al Planner en cada tick.

Cualquier estado activo puede pausar, fallar o abortar. Los estados terminales no transicionan. La constante de aprobación del Judge solo se utiliza después de evaluar la evidencia completa; no es una herramienta expuesta al modelo.

## Repairs y replanteo

Un fallo produce evidencia, clasificación y firma normalizada. El primer intento de repair recibe el fallo y los artifacts. La segunda aparición de la misma firma obliga a un replanteo; riesgo crítico/persistencia lleva al Oracle. UUIDs, tiempos de ejecución y puertos temporales no deben aparentar nuevas causas. Cambiar task ID no resetea el linaje.

El plan nuevo conserva criterios/checks aprobados; no puede reducirlos. Un productor que falla o cambia invalida sus consumidores. La integración conflictiva se delega al integrator apropiado y se verifica nuevamente; no se aplica ours/theirs indiscriminadamente. Dependencias se satisfacen con outputs aceptados y versiones verificadas, no con mensajes de finalización.

Fallos de Docker, auth, cuota, reasoning o red de infraestructura pausan en vez de crear repairs de código inútiles. No-progress se mide por verificaciones obligatorias que avanzan, no por número de diffs o planes nuevos. Al alcanzar límites se preserva el candidato y se explica FAILED/PAUSED.

## Oracle

Read-only. Se invoca por auth/autorización/pagos/migraciones/concurrencia/integridad, riesgo alto, escalado o revisión final habilitada. No es programador principal. Una consulta `diagnostic` no puede servir como aprobación `acceptance`. `uncertain` no equivale a aprobación.

## Judge

Exige plan y criteria sin alteración, conjunto activo de tasks aceptadas, dependencias/versiones correctas, resultados del candidato actual, último check obligatorio aprobado y exit code cero, evidencia íntegra producida por el runner correspondiente, reviews acceptance requeridas y sin blockers, permisos/routing válidos y aprobaciones humanas cuando correspondan.

Un snapshot de otro commit, un reporte prestado de otra verificación, un `skip`, un mensaje “listo” o una review diagnóstica no permite DONE. No es una prueba formal: la calidad de los criterios aprobados y de los tests sigue importando. Un objetivo estético abierto puede necesitar aceptación humana.
