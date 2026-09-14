# Reservations smoke

Ejecutar `perfect smoke --fullstack --mock --accept-plan`. El código de fixture está en `src/examples/reservations.ts`, `reservation-backend.ts`, `reservation-frontend.ts` y `reservation-tests.ts`; se incluye compilado en el paquete. No se copian credenciales.

La versión real cambia a los bindings configurados omitiendo `--mock` y pasando `--allow-contributor` solo para esta información sintética. El sistema obliga a verificación y Oracle por concurrencia/integridad. Consultar `docs/local-smoke.md`.
