# Capturas reales de Perfect

Estas capturas muestran **Perfect Harness**, no solamente la aplicación de reservas que el motor puede construir.

## Versión en español

En `es/` están las vistas de inicio, ejecución, concurrencia, reparación, terminal compacta, agentes, plan, verificación, modelos, pausa, completado y ajustes de la versión 0.2.1. El renderizador OpenTUI/React real produce las celdas y sus colores; el script las convierte a PNG. Los archivos `.txt` conservan la cuadrícula exacta.

Los datos son sintéticos y están identificados como **DEMO**. No son capturas del sistema operativo y no prueban inferencias de Grok, Muse o Astra. Las cuatro cuadrículas revisadas —ejecución, compacta, agentes y completado— se comparan en las pruebas sin sobrescribir la referencia esperada. `es/revision.json` identifica la ejecución que produjo este conjunto inicial.

## Capturas históricas

Los archivos en la raíz y las carpetas `windows-desktop/` y `linux-desktop/` conservan la versión anterior, en inglés, y su procedencia original. No fueron editados para aparentar que estaban traducidos. El README principal enlaza al conjunto español.

Las imágenes de `windows-desktop/` son capturas de píxeles de Windows Terminal ejecutando el paquete de Perfect. `linux-desktop/xterm-repair.png` es una captura real de xterm. El sistema Windows utilizado es **Windows Server 2025 build 26100**, no una certificación de Windows 11.

Los flujos permanentes producen capturas nuevas para cada commit. En el flujo de Windows, consultá el archivo `windows-terminal-desktop` y su `provenance.json`; si informa `BLOCKED`, la captura no está validada. El conjunto histórico versionado no sustituye estas pruebas nuevas.

## Referencia conceptual

`../design/perfect-v2-direction.webp` es la imagen generativa de dirección de diseño aprobada, no una captura de implementación. La cuadrícula de una terminal no puede reproducir refracción arbitraria por píxel.
