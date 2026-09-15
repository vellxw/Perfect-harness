# Compatibilidad inicial de Perfect Desktop

Base V4 f527a2f491e30e482d46c14138429bd90916da85. Electron 44.3.0 y su Node embebido no ejecutan el motor: se usa un proceso separado Node 26.4.0 con ruta explícita. El renderer no recibe Node ni Pi/SQLite.

El run 34989553040 verificó el candidato derivado de a1eec57801f53a9632e8c3d2cee5023247f4d82d en Ubuntu 24.04 y Windows Server 2025: typecheck, lint, configuración, build, 212 tests nativos aprobados y siete E2E omitidos explícitamente para sus jobs especializados. La ventana Electron real abrió y ejecutó una goal real que pausó con cero solicitudes al faltar cuentas, comprobando el puente IPC y el aislamiento del renderer.

La primera ejecución Windows detectó dos condiciones de tiempo en pruebas heredadas (tecla Escape de OpenTUI y arranque del worker TSX); se repitió una vez el mismo candidato sin modificar assertions ni ampliar límites y ambas plataformas aprobaron. No se considera ese reintento una solución definitiva a pruebas intermitentes: la validación final debe estabilizar y repetir las rutas pertinentes.

Electron 44 descarga su binario de forma diferida. El build prepara explícitamente node_modules/electron/install.js antes de probar/empacar. La instalación del paquete npm por sí sola no se cuenta como binario instalado.

Este es un gate de arquitectura, no la aceptación de paridad, seguridad completa, rendimiento, capturas finales o distribución Windows. Las siguientes revisiones deben comprobar su propio HEAD.
