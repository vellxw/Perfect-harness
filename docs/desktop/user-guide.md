# Usar Perfect Desktop

## Elegir proyecto y escribir

El selector de carpeta autoriza una ubicación concreta. No importa silenciosamente todos tus documentos. Los recientes pueden volver a abrirse cuando la ruta sigue disponible. Si una carpeta se movió, elegí su ubicación actual; Perfect no interpreta el error como un proyecto vacío.

Mientras se restaura el motor, el composer admite texto y explica que todavía no puede enviarlo. El borrador se conserva entre secciones y al terminar la conexión; está en memoria y no sobrevive al cierre de la ventana. Los objetivos que ya enviaste se guardan separadamente y sí admiten recuperación.

Elegí modo, privacidad y referencias antes de iniciar. Una imagen de referencia no demuestra que el resultado exista. Las referencias importadas conservan sus propios hashes y permisos. Para cambiar criterios de una goal ya aceptada usá el procedimiento de aprobación, no modifiques su evidencia.

## Habilidades y equipos

En **Habilidades** hay tres modos: apagado, manual y selección automática dentro de los equipos autorizados. El interruptor general prevalece sobre todos los demás controles.

En manual, seleccioná versiones concretas. Si la lista está vacía, los agentes no reciben skills. Una asignación global hace una habilidad disponible para todos, pero no la carga automáticamente. Podés desactivar una habilidad para Backend aunque esté disponible globalmente; la exclusión prevalece.

En **Equipos** cambiás miembros y conocimientos. En **Perfiles y modelos** cambiás la ruta de un perfil sin convertirlo en otro rol. Un revisor de solo lectura no adquiere escritura por elegir otro modelo.

Los cambios que afectan sesiones activas solicitan pausa/reinicio seguro. Ningún interruptor borra retroactivamente instrucciones que un modelo ya leyó. El trabajo, los intentos y las evidencias anteriores se conservan.

Superpowers permanece apagado inicialmente. Activarlo es una decisión explícita, no una dependencia oculta del creador o del Planner.

## Revisar y aplicar

**Plan** muestra criterios y tareas. **Verificación** muestra resultados y fallos, no solo declaraciones del agente. Las evidencias están ligadas a una revisión; una captura anterior no prueba el candidato nuevo.

**Cambios** permite revisar diferencias. **Aplicar al proyecto** conserva las verificaciones del candidato y comprueba que la carpeta original no haya divergido. Si cambiaste archivos por fuera, Perfect debe pedir reconciliación, no sobrescribirlos silenciosamente.

No se ofrecen acciones de aceptar fragmentos arbitrarios como si conservaran automáticamente la coherencia y evidencia del candidato completo.

## Imágenes, videos y 3D

Los resultados se abren mediante identificadores autorizados. Podés ampliar imágenes, reproducir video, recorrer su tiempo y manipular GLB compatibles. No todos los formatos de editores comerciales son un preview ejecutable dentro de Perfect.

Los archivos grandes requieren límites y memoria. Los visores se cargan bajo demanda. El preview de una aplicación generada está aislado de la interfaz privilegiada; no utiliza tus cookies ni modifica la sesión de pruebas automáticas cuando hacés clic.

Una captura o render bonito no equivale a jugabilidad, autenticación, rendimiento o integridad de datos. El Judge combina los criterios de la goal.

## Crear una skill

Abrí el creador desde Habilidades, describí su propósito y equipo, y definí entradas, salidas y comprobaciones. El autor genera un paquete revisable. **Recopilar borrador** comprueba procedencia y candidato antes de ponerlo en cuarentena.

Inspeccionar, evaluar, aprobar para uso y seleccionar son acciones distintas. Las evaluaciones A/B no pueden editar sus verificadores para mejorar el resultado. Los informes distinguen mejora, empate, regresión, ambos-fallan e infraestructura interrumpida. No extrapolan una pequeña prueba a todos los modelos.

## Proveedores e integraciones

Elegí la cuenta y ruta real en su configuración local. El nombre que un modelo diga de sí mismo no es prueba de identidad. La conexión no hereda permisos de GitHub o cuentas de otra aplicación.

Las operaciones de escritura requieren autorización de alcance concreto. Una respuesta perdida puede dejar un efecto incierto: revisá la operación antes de repetirla. No desconectes una integración suponiendo que deshace una escritura ya realizada.

**Validación local** muestra por separado si un adaptador existe, está configurado y llegó a ejecutarse. Si no hay adaptador para un editor, instalarlo o ingresar una cuenta no vuelve implementada esa capacidad.

## Pausa, cierre y recuperación

Minimizar no cancela el objetivo. Cerrá con la opción segura que ofrece Perfect cuando hay actividad. No finalices procesos manualmente salvo una emergencia: podrían quedar efectos externos inciertos que deben reconciliarse.

Si el motor cae, la interfaz muestra el fallo y permite recuperar el estado. No crea otra goal ni transforma el fallo en DONE. Los locks no se liberan antes de confirmar el cierre del trabajo anterior.

Desktop y CLI usan el mismo estado y sus reglas de exclusión. Una segunda ventana o una CLI no debe ejecutar trabajo incompatible sobre la misma goal.

## Actualización y datos

Pausá el trabajo y cerrá Perfect antes de ejecutar un instalador nuevo. Los datos se mantienen fuera del directorio del programa. Conservá los backups de migración mientras comprobás la actualización.

La carpeta portable incluye Electron, Node del motor y módulos. Copiar un solo `.exe` deja el paquete incompleto. Los proyectos no se copian dentro de esa carpeta por instalar o actualizar.

La desinstalación retira únicamente recursos propios: no debe borrar proyectos, cuentas locales, entradas ajenas del PATH ni configuraciones personales de Windows Terminal.

El README y los manifiestos de la release identifican el commit y las plataformas ensayadas. Un paquete sin firma Authenticode no ofrece la identidad de un editor firmado; no desactives protecciones del sistema para ocultar ese hecho.
