# Backend propio de ejemplo

Fastify 5.12.3, TypeScript ejecutado por Node 24 y pg 8.23.0. Migraciones SQL con checksum, una transacción y un lock para evitar aplicación concurrente. API con validación, conflicto UNIQUE y parámetros, pool y cierre ordenado.

La prueba E2E de Perfect prepara las dependencias explícitamente, crea PostgreSQL 18.6 en una red Docker interna sin puertos publicados y ejecuta la API/pruebas en otro contenedor. La base se elimina al finalizar y no acepta una URL de producción. La prueba reinicia la API (y su pool) y comprueba que los datos sobreviven; no afirma haber probado recuperación de desastre o backup físico.

El ejemplo no incorpora cuentas ni autorización porque no es un sistema multiusuario publicado. Una aplicación que lo requiera debe incluir esa política explícita y sus pruebas. No se usa Supabase ni se modifica el almacenamiento SQLite de Perfect.
