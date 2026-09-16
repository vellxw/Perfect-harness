# Línea base de rendimiento V5

Run 35042477844, fuente 4f384517e4f63018419b7a381757cda0e649a2eb. Electron real y bundles de producción en Linux virtual. No se alcanzó aceptación.

En diez arranques por clase, el peor arranque de proceso con perfil nuevo fue aproximadamente 2172 ms y el de perfil reutilizado 1733 ms. Con diez muestras, p95 por nearest-rank corresponde al máximo. Los objetivos permanecen 2000 ms y 1000 ms. No se modifican para convertir el baseline en PASS.

La prueba llegó a medir cinco minutos de reposo y a generar la carga de presentación. Se detuvo al intentar abrir un artifact sintético porque el test escribió SHA256 de bytes, mientras el contrato Evidence.contentHash usa el hash de la representación base64. El verificador lo rechazó correctamente. Hay que corregir el fixture, no omitir la comprobación de integridad.

La primera optimización difiere el SDK Pi, herramientas y adaptadores de ejecución hasta que se solicitan. Abrir la ventana no debe inicializar todos los proveedores. La medición posterior y las regresiones reales de sesiones siguen siendo obligatorias; no se afirma una mejora antes de observarla.

El fallo nativo Windows adicional se identificó como Chromium SBOX_ERROR_CANNOT_CREATE_RESTRICTED_TOKEN (49), no como un error de la UI. El test reduce privilegios pero debe conservar acceso normal del usuario a sus propios objetos kernel. La corrección está limitada al DACL predeterminado del proceso de prueba y no desactiva el sandbox, fuses o controles de la aplicación.
