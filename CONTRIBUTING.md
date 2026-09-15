# Contribuir

Usar Node 24, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Para Docker E2E, preparar las imágenes indicadas en README y ejecutar `PERFECT_TEST_DOCKER=1 npm run test:e2e`. El test Remotion descarga dependencias de fixture al registro público únicamente durante preparación explícita.

No usar cuentas personales en tests de CI. Los cambios al adaptador Pi necesitan un contrato que atraviese Pi real con transporte falso, no solo mocks de la interfaz AgentRuntime.

Regenerar config/schema con `npm run generate:config`; CI comprueba que estén sincronizados. No modificar tests/referencias para ocultar un fallo. Añadir regresión primero para bugs de routing, Judge, recuperación o ownership. Mantener el dominio libre de imports Pi/SQLite/CLI.

No actualizar Pi o Playwright sin revisar tipos, payloads y catálogo. Conservar package-lock.json y evitar rangos de dependencia para el runtime. Revisar artifacts solo con datos sintéticos. No versionar bases SQLite, auth, sesiones, dependencias instaladas ni screenshots de proyectos privados.
