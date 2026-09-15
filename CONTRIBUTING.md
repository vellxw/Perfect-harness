# Contribuir

Usá Node **26.4.0**, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Para los casos integrales de Docker, prepará las imágenes indicadas en el README y ejecutá `PERFECT_TEST_DOCKER=1 npm run test:e2e`. El caso de Remotion descarga sus dependencias del registro público únicamente durante la preparación explícita.

No uses cuentas personales en CI. Los cambios del adaptador Pi necesitan pruebas que atraviesen el SDK real con transporte simulado, no solo una sustitución de `AgentRuntime`.

Regenerá configuración y esquema con `npm run generate:config`; CI comprueba que sigan sincronizados. No modifiques pruebas ni referencias para ocultar un fallo. Añadí primero una regresión para errores de rutas, evaluador, recuperación o asignación de archivos. Mantené el dominio libre de dependencias de Pi, SQLite y CLI.

La interfaz está en español. Añadí etiquetas y alias en `src/i18n`, conservando las claves JSON, enums, nombres de proveedores, niveles de razonamiento y evidencia original. Un texto con tildes debe atravesar la interfaz sin modificaciones. No agregues llamadas a modelos para traducir mensajes de la interfaz. Los mensajes externos desconocidos se conservan, no se inventa una interpretación. Un cambio de idioma o diseño que requiera nuevas referencias visuales debe quedar autorizado y documentado.

No actualices Pi o Playwright sin revisar sus tipos, solicitudes y catálogo. Conservá `package-lock.json` y evitá rangos de versiones para el entorno de ejecución. Revisá capturas solo con datos sintéticos. No versiones bases SQLite, autenticaciones, sesiones, dependencias instaladas ni capturas de proyectos privados.
