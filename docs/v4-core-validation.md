# Validación del núcleo V4 (hito, no entrega final)

El workflow 34908098884 comprobó las adaptaciones del núcleo sobre el commit 40ec9500119eb09c7112d381005e26aa77fbc9fb y produjo el árbol e6df3c1d468103c95c5e16e983939ece53f4b244: typecheck, lint, configuración, build, 168 tests aprobados y tres E2E Docker omitidos en ese job, empaquetado limpio. No se utilizaron cuentas personales.

La auditoría señaló un advisory moderado en yaml 2.8.2 (GHSA-48c2-rrv3-qjmp); debe fijarse la versión corregida 2.9.1 y repetir antes de una entrega. Esta nota no declara segura ni final la versión intermedia.

El cambio de entorno stdio resuelve nombres de variables Windows sin permitir heredar secretos: todavía se exige la ejecución de las regresiones nativas Windows del commit publicado. El núcleo ya separa perfiles y equipos, snapshots inmutables y catálogo autorizado por sesión. Faltan las superficies administrativas y adaptadores de los siguientes hitos.
