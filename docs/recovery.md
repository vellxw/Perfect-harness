# Persistencia y recuperación

SQLite almacena goals, planes inmutables, tasks, attempts, runs, evidence, verificaciones, reviews, failures, usage, ownership, approvals y operation intents. Cada mutación relevante registra un evento en la misma transacción. El log es ligero: hitos del dominio, no cada token.

Antes de reanudar, el proceso adquiere exclusión del workspace, reconcilia containers/networks por nombre y label de goal, y solo libera leases una vez confirmado que no sigue ejecutándose el intento anterior. Un error de Docker inspect no se interpreta como “no existe”; un recurso de otro dueño no se elimina.

Una integración interrumpida exige intent, parent revision, mensaje/checkpoint y ownership coherentes. Cambios manuales del candidato sin intent o archivos dirty provocan PAUSED en vez de adoptar silenciosamente un baseline. Las requests interrumpidas se marcan inciertas: pueden haber consumido cuota.

`pause` detiene nuevas asignaciones y cancela a un punto recuperable. `abort` cancela y conserva source/outputs; no borra automáticamente el trabajo. Las goals DONE/FAILED/ABORTED son terminales. `retry` requiere PAUSED y respeta counters.

`apply --yes` se registra antes de modificar el origen. Si la operación queda incierta, no se repite automáticamente; inspeccionar el checkout. Si origen o candidato cambiaron, se requiere reconciliación/nueva verificación, no un reset destructivo.

Los artifacts no tienen GC automático en V1. Conservar los necesarios para auditoría y borrar manualmente goals antiguas solo cuando no tengan ejecuciones activas. SQLite está soportado en disco local, no como estado compartido por red.
