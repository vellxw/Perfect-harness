# Calidad, rendimiento y alcance de las mediciones

## Arranque e interacción

El cronómetro de arranque se inicia antes de lanzar el proceso. La primera interacción válida puede ser escribir un borrador local mientras el motor termina de restaurar estado. No se simulan goals ni se habilita envío antes de conexión. El tiempo de conexión del motor se registra aparte.

La regresión de arranque suspende el proceso Node real del entorno de prueba, escribe texto y comprueba que el envío está deshabilitado; después reanuda el proceso y confirma conservación del texto y ausencia de una goal automática.

Los casos fríos usan perfiles de datos nuevos; los calientes reutilizan un perfil ya abierto. No se presentan como limpieza forzada de cachés de disco o como hardware idéntico al del usuario. Las mediciones de input/feedback evalúan cambios visibles de la aplicación, no una certificación óptica teclado-a-fotón.

## Memoria y CPU

Se mide el árbol completo de procesos propios, incluido el motor separado. En Linux se informa RSS por proceso y su suma, además de PSS, memoria privada y SwapPSS. Sumar RSS cuenta páginas compartidas repetidamente; la atribución PSS+SwapPSS no oculta esa suma, que permanece en el reporte como comparación explícita.

Cambiar la metodología no es por sí solo una optimización. No se afirma que RSS haya descendido bajo el objetivo cuando solo lo hace la atribución proporcional. Una métrica ausente o inconsistente produce fallo/bloqueo, no cero.

El benchmark FULL conserva cinco minutos de idle y al menos treinta minutos de sesión, junto con eventos/tareas/streams sintéticos, interacciones y ciclos de medios. SCREENING_NOT_ACCEPTANCE es únicamente una prueba corta de diagnóstico y no permite publicar.

Los objetivos originales son 2 s de arranque frío hasta edición, 1 s caliente, p95 de input 50 ms, feedback de clic 100 ms, memoria atribuible idle 450 MiB y CPU media idle menor de 1 % de un núcleo. Los resultados reales y muestras se consultan en el reporte del candidato; no se reemplazan por cifras de otro run.

## Motion y grabación

El producto conserva presión, hover, paneles y modales cortos. El backdrop que oscurece detrás de un diálogo no filtra toda la ventana por frame; la superficie del panel mantiene su estilo.

La comprobación de motion usa las animaciones de producción sin CSS inyectado y sin desactivar preferencias. Exige al menos cincuenta frames activos por escenario y p95 de intervalos RAF menor o igual a 20 ms para paleta/formulario: objetivo de 60 Hz con tolerancia de planificación del entorno. No es una prueba de FPS en la GPU del usuario.

Los experimentos que retiran CSS y las medidas con grabación son diagnóstico separado. El video conserva su velocidad y timestamps originales; no se interpola ni acelera para aparentar fluidez. Si el capturador no alcanza los 60 fps solicitados, se informa la cadencia real y no se usa como medición del renderer.

## Videos e inspección

Cuatro recorridos: uso cotidiano, Goal Loop completo, instalación/actualización Windows y motion/rendimiento. Los providers sintéticos se identifican. Los archivos se decodifican completos antes de agregarlos y se extraen frames de apoyo; eso no sustituye abrir e inspeccionar la evidencia.

Los targets del diseño son conceptos aprobados, no capturas de implementación. Las imágenes y videos de aceptación provienen del software ejecutado. Los modelos 3D, apps de ejemplo y renders se muestran como resultados de Perfect, nunca como si fueran su interfaz.

## Firma y cuentas

Los checksums verifican los bytes ensayados. Sin Authenticode no se afirma identidad de editor firmado. Las cuentas personales, cuotas y editores externos se validan con permisos locales explícitos. Una funcionalidad sin adaptador se identifica como no implementada, no se hace pasar por un simple login pendiente.
