# ADR 001 — Runtime y persistencia

Elegimos aplicación TypeScript propia + Pi SDK. El dominio no depende de Pi; la CLI y la extensión pequeña invocan la misma capa de aplicación. Una extensión gigante acoplaría recuperación, presupuesto y scheduling a la UI. Usar pi-agent-core directamente obligaría a reconstruir sesiones sin aportar valor inmediato.

SQLite + eventos transaccionales para coordinación; JSONL de Pi para conversaciones; archivos para artifacts. No hay Redis, Postgres ni runtime distribuido. Worktrees y snapshot administrado para versiones; Docker, no Git, para aislamiento de ejecución.
