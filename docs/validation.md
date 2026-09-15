# Validación de V1

## Tres niveles distintos

1. Tests deterministas: estados, DAG, scheduling, ownership, budgets, escalado, Judge, recuperación y errores.
2. Contratos del SDK: Pi real contra un servidor SSE falso con tool calls, selección explícita, cancelación, metadata y fallos. No son inferencias reales de Grok/Astra/Muse.
3. E2E Docker: código real, Git, API, SQLite, navegador, repair visual, frames y video. Solo los providers/reviews del ejemplo fullstack están guionados.

El job `checks` ejecuta instalación reproducible, typecheck, lint, contratos/tests, build, schema sync y empaquetado en directorio limpio. El job `docker-e2e` activa las pruebas que `npm test` omite si no hay Docker. Nunca se declara todo probado a partir de un job que omitió esos tests.

## Regresiones cubiertas

Routing exacto y no-clamp; metadata absent vs zero; modelo/esfuerzo equivocado en SSE; fragmentación de transporte; cancelación; DAG cíclico/dependencias inválidas; paralelismo con superficie excluyente; leases expirados no reasignados; replan que conserva indebidamente productor fallido; linajes de repair; no-progress; auth preflight sin consumir intento; consentimiento/clasificación; DNS privado; symlinks/hardlinks; evidencia de otro runner/revisión; review diagnóstica usada como aprobación; dirty source; candidato alterado tras revisar; base SQLite futura; binding inmutable; reservas concurrentes y usage negativo; pausa/abort/resume.

## Evidencia que produce CI

`fullstack-evidence`: capturas de fallo y corrección, traces, logs y fullstack-summary.json con modo/roles, iteraciones y resultados.

El mismo artifact incluye el subdirectorio `remotion` cuando el E2E de render termina: frames, MP4 y metadata. La CI usa solo datos sintéticos. La aprobación visual de providers falsos es plumbing, no calidad de juicio de un modelo real.

Para afirmar CI verde, comprobar el run del **commit exacto** de la rama/PR. Un run anterior no valida cambios nuevos. Las pruebas de las cuentas OAuth personales quedan para `perfect smoke` local; no son suplidas por la CI.
