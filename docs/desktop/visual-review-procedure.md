# Revisión visual: cobertura completa y aprobación separada

El candidato db077c8 pasó los siete gates automáticos y la instalación/actualización, pero su observador auxiliar agotó el presupuesto después de 11 de 28 imágenes. Ese fallo se conserva en el run 35137467471; no se convierte en PASS ni demuestra un defecto de la app.

El observador ahora divide la misma selección de ocho capturas y veinte fotogramas entre siete procesos independientes. No reduce resolución, prompt, modelo, revisión de pesos, longitud de salida ni cobertura. Cada proceso tiene límite temporal. Un gate de unión verifica que las particiones sean disjuntas y completas, que hashes/modelo/commit coincidan y que existan respuestas para todos los elementos. Las pruebas rechazan partes ausentes, repetidas, incompletas o de otra fuente. Ninguna respuesta del modelo autoriza una release.

Una observación de otro modelo no reemplaza abrir las imágenes y revisar los videos. La aprobación de distribución sigue siendo una acción explícita ligada al SHA del código, al artifact de aceptación y a los hashes de los cuatro videos y capturas representativas. La revisión directa debe registrar método y limitaciones (por ejemplo, secuencias de fotogramas más decodificación completa, no afirmar reproducción humana continua).

Al abrir las capturas de db077c8 directamente se encontró una discrepancia real de evidencia: skills-manual-empty podía capturarse antes de que el nuevo modo se persistiera, porque el contador ya indicaba cero en automático. La prueba espera ahora la confirmación del controlador y el valor visible manual antes de capturar. No se alteró la lógica del producto ni se reemplazó la imagen por una generada. El reporte utiliza buildId comprobado en vez de confundir GITHUB_SHA del merge de prueba con el checkout.

Después de una modificación se genera un nuevo candidato y se repiten los gates. Las capturas anteriores mantienen su procedencia y no se atribuyen al nuevo binario. Antes de publicar se revisan los archivos nuevos; checks verdes o PNG existentes no equivalen a aprobación estética.
