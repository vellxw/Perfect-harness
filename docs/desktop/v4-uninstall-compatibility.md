# Compatibilidad con el hook de desinstalación de V4

En el run 35103703642 del commit 24fc3ae, el portable, la instalación limpia y la actualización real V4→V5 conservaron datos y credenciales sintéticas. La desinstalación limpia también terminó. La desinstalación posterior a actualizar quedó esperando diez minutos.

V4 registra en [UninstallRun] `Perfect.exe --remove-profile` con `waituntilterminated` y `RunOnceId: PerfectTerminalProfile`. La actualización de Inno mantiene ese registro. El ejecutable que ahora ocupa esa ruta es la GUI V5; al ignorar el argumento abría una ventana y un motor en lugar de terminar la limpieza. Los logs del fallo muestran un nuevo proceso Chromium precisamente al iniciar la desinstalación de la instalación actualizada.

La corrección añade un bootstrap de compatibilidad que procesa únicamente ese argumento de Windows empaquetado antes de inicializar la interfaz, userData, exclusión de instancia o motor. Comprueba el GUID, nombre y comando exactos del fragmento Terminal correspondiente a ese ejecutable y solo retira ese archivo. No toca settings.json, PATH, credenciales, proyectos ni recursos de otra instalación. Si el fragmento ya fue retirado por el instalador V5, termina correctamente sin acciones.

No se borran registros de desinstalación históricos ni se evita la prueba. El mismo recorrido de actualización y desinstalación, con los binarios finales endurecidos y el usuario de prueba no administrativo, debe comprobar el cambio. Esta nota explica el defecto y la solución; no declara aprobado un run futuro.

Fuentes inspeccionadas: build/windows/perfect.iss del tag v0.4.0 y el log del job Windows 104819903862. La salida temprana de la operación de compatibilidad no afecta el cierre seguro de goals: el core ni siquiera se inicia en ese proceso auxiliar.
