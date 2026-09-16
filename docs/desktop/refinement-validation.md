# Refinamiento incorporado a la fuente

El run 35099881367 aplicó parches normales contra 6facb10668628e3a592051a8a8a166ac5bdfc905 y verificó typecheck, lint, configuración, build y 227 tests aprobados (siete E2E pesados se ejecutan en sus jobs). El árbol comprobado es 6b2e877cb0482adeaf6f24b3b2b8497ff6cc7217. Los parches y el workflow temporal se retiraron al incorporar el cambio como fuente normal; ningún build necesita reconstruir el código.

La nueva regresión suspendió el proceso real del motor, escribió un borrador en la GUI, comprobó que enviar permaneciera bloqueado, reanudó Node y confirmó que el texto sobreviviera a la hidratación y a navegar entre pantallas, sin crear una goal. Ese test forma parte del workflow Desktop permanente.

El screening posterior observó 470,9 ms de primer arranque hasta composer editable y 381,0 ms en reapertura, con los tiempos de motor registrados por separado. Es una muestra corta y NO aceptación final. El mismo screening midió 455,6 MiB PSS+swap, sobre el objetivo de 450 MiB; no se presenta como una optimización aprobada de memoria. La prueba completa de cinco minutos y treinta minutos de uso sigue siendo obligatoria.

La corrección Windows espera la fase temporal real de Inno antes de comprobar restauración exacta de PATH y borrado de sus binarios. Las pruebas de instalación/migración/desinstalación del nuevo commit deben ejecutarse todavía. No se alteraron las condiciones esperadas ni se borraron entradas ajenas para hacer pasar el test.

La animación de la interfaz de producción se comprueba además sin CSS inyectado ni grabación: p95 de frames animados en paleta y formulario <=20 ms, con al menos 50 muestras activas por caso. Los experimentos de CSS y la sobrecarga de grabación se conservan como diagnóstico separado, nunca como prueba de los bytes distribuidos.
