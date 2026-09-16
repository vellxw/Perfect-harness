# Solicitudes durante sesiones largas

Se elimina el límite de 10.000 solicitudes que forzaba a reiniciar Desktop. La interfaz y el motor usan recibos exclusivos por ID dentro del estado local del escritorio, sin acumular todos los UUID en un Set residente. Cada participante tiene su propio canal de recibos; no se guardan payloads, credenciales ni respuestas.

El ID de sesión del escritorio permanece igual al reiniciar solamente el motor. Una solicitud consumida antes de ese reinicio sigue rechazada. Una nueva acción elegida por el usuario usa un ID nuevo y continúa sujeta a aprobaciones, intents y reconciliación del controlador. Esto no hace una transacción distribuida ni garantiza ejecución exactly-once ante cualquier pérdida física de almacenamiento.

Los recibos se retiran después de confirmar el cierre de ambos procesos. Un cierre abrupto puede dejar archivos de recibos en `desktop-request-receipts`; no se interpretan como trabajo completado ni liberan locks. Una nueva sesión no reutiliza sus IDs. Se limita la cantidad simultánea de solicitudes, no el total de interacciones que puede hacer el usuario durante una jornada.

Las pruebas comprueban más de diez mil solicitudes, repetición concurrente, reinicio del participante, separación de canales y ausencia de rutas arbitrarias. El benchmark posterior mide el impacto real del bridge, no una implementación sin comprobaciones.
