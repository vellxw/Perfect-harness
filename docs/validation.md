# Validación del núcleo, la interfaz y Windows

## Capas independientes

1. Núcleo determinista: estados, grafo de tareas, planificación de ejecución, áreas asignadas, presupuestos, reintentos, evaluador, recuperación y errores.
2. Contratos del SDK: sesiones reales de Pi contra un transporte SSE controlado, con herramientas, rutas explícitas, cancelación y metadatos. No son inferencias de cuentas personales.
3. Presentación: ciclo real del proceso hijo mediante IPC privado, preferencias guardadas, eventos posteriores a transacciones, rechazo de acciones entre carpetas y un objetivo iniciado desde la interfaz que se pausa al no tener cuentas.
4. Interfaz nativa: OpenTUI real, teclado, distribución, paletas, vistas, secretos enmascarados, cambio de tamaño, cancelación escrita, aprobación de planes extensos y cuatro referencias de cuadrículas de texto.
5. Extremo a extremo en Docker: Git, código, API, SQLite, navegador, fallo, reparación y evaluador reales; además fotogramas Remotion y video H.264. Solo se simulan decisiones y revisiones de proveedores.
6. Paquete Windows: metadatos, icono, versión sin Node externo, perfil de terminal, instalación limpia por usuario, PATH y desinstalación. Las capturas reales de Windows Terminal son una salida independiente con procedencia.

La versión 0.2.0 tenía 118 casos. La localización 0.2.1 añade 21 y conserva los controles funcionales: **139 casos; 137 ejecutables sin Docker y dos omitidos explícitamente cuando no existe ese entorno**. El flujo de Docker ejecuta esos dos casos, en lugar de tratarlos como aprobados por omisión. Linux y Windows repiten la misma suite; no se cuentan dos veces como cobertura distinta. Estas cifras describen la composición de la suite, no garantizan una ejecución que no se haya observado.

## Verificación del idioma

Las pruebas cubren los comandos españoles y sus nombres anteriores, argumentos literales, rutas, tildes y eñes, conservación de claves JSON y enums, niveles de razonamiento reales, mensajes desconocidos, todas las vistas principales y confirmaciones españolas que no amplían permisos. La salida humana también elimina secuencias de control de terminal sin modificar el dato original.

Las cuatro referencias de texto para la versión española se guardan en `docs/screenshots/es`. Se actualizaron por la petición explícita de traducir, no para ocultar fallos. La CI compara las referencias antes de producir capturas nuevas; las pruebas no sobrescriben sus resultados esperados.

## Resultados e interpretación de CI

La matriz nativa realiza instalación reproducible, comprobación de tipos, estilo, sincronización del esquema, pruebas, compilación e instalación limpia del paquete. Publica capturas y mediciones por sistema operativo. Docker publica la evidencia integral y de Remotion. El flujo Windows publica instalador, ZIP completo, sumas de verificación y procedencia de las capturas.

Comprobá el **HEAD exacto** de la rama o PR. Un resultado verde anterior no valida código nuevo. Windows Server 2025 no equivale a una sesión personal de Windows 11. Una captura DEMO no prueba autenticación de modelos. Un resultado `BLOCKED` no equivale a una captura válida.

## Medición de rendimiento

`scripts/benchmark-tui.mjs` mide desde el despacho del teclado hasta una imagen solicitada explícitamente al renderizador. No mide la latencia completa hasta el monitor. El campo de inicio incluye una espera deliberada de 100 ms después de importar módulos; **no es una medición de arranque en frío**. El consumo en reposo se muestrea durante un segundo.

La carga usa 20.000 eventos, 500 tareas, 1.000 actualizaciones agrupadas y cambios repetidos de tamaño. La variación de memoria en una ejecución con muchas asignaciones no demuestra por sí sola una fuga ni su ausencia. Los informes versionados pertenecen al conjunto de capturas que identifica su procedencia; los resultados posteriores están en los archivos del commit de CI correspondiente. Los objetivos de 16 ms y 50 ms no son certificaciones inventadas.

## Seguridad y límites

La interfaz no puede establecer `DONE`, sustituir identidades de modelos ni aprobar criterios automáticamente. Las secuencias de terminal son datos. Los archivos se validan por alcance, hash y tipo. La privacidad y los consentimientos no se reducen silenciosamente. No hay ejecución directa en el equipo como alternativa al contenedor. Los checksums de un ejecutable sin firma prueban integridad, no identidad del editor.

Las pruebas con cuentas reales son locales. La aceptación de teclado, aspecto y Docker en Windows 11 sigue requiriendo comprobación local. La refracción por píxel del diseño no existe en las celdas: Acrylic pertenece a Windows Terminal. Las imágenes dentro de la terminal son opcionales; abrir externamente archivos verificados es la alternativa implementada. No se incluyen cuentas OAuth, claves API ni certificados privados en CI.
