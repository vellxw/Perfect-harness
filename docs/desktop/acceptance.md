# Perfect Desktop V5 — matriz de aceptación

Base observada: V4 0.4.0, f527a2f491e30e482d46c14138429bd90916da85. La rama V5 no fusiona ni publica una release estable. El core permanece autoritativo.

| Gate | Requisito | Evidencia necesaria |
|---|---|---|
| Compatibilidad | Electron/Node separados, ventana real, IPC, cierre | Contrato Linux y Windows |
| Seguridad | Renderer aislado, origen/emisor, permisos, preview | Tests adversariales + binario final |
| Paridad | Todas las acciones V4 accesibles con mouse | Inventario y E2E de recorridos |
| Diseño | Referencia black glass, DPI, teclado/mouse | PNG abiertos e inspeccionados |
| Rendimiento | Inicio, input, idle, memoria, stress | Mediciones del build de producción |
| Medios | Imágenes/video/GLB, preview independiente | Archivos reales y aislamiento |
| Windows | Instalación, actualización V4, portable | Binarios exactos, reportes y video |
| Entrega | CI del SHA final, videos, hashes y PR | Sin afirmar PASS de cuentas personales |

Los primeros commits pueden ser hitos incompletos, no entregas finales. Los datos DEMO nunca certifican inferencia real. La captura de Playwright no equivale a una captura del escritorio Windows. Sin firma Authenticode no se promete identidad del editor.

La ejecución local de esta conversación no respondió al iniciar el trabajo. Se utilizan runners autorizados de GitHub para bloques completos de validación, sin tocar main. El workflow temporal de compatibilidad debe retirarse al integrar el lockfile y establecer CI permanente.
