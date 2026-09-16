# Correcciones basadas en pruebas, no en reducción de criterios

## Finalización del desinstalador

En el candidato 5e7188e, el proceso inicial de Inno devolvía 0 antes de que su copia temporal terminara usPostUninstall. El test leía inmediatamente el PATH y volvía a ejecutar el uninstaller durante esa fase. El código primario de Inno confirma el orden: DeleteUninstallDataFiles notifica la terminación de la primera fase y solo después se llega a CurUninstallStepChanged(usPostUninstall). Fuente: https://github.com/jrsoftware/issrc/blob/main/Projects/Src/Setup.Uninstall.pas .

La corrección espera condiciones observables, durante un máximo de 30 segundos: PATH exactamente restaurado, recibo propio retirado y ejecutables de instalación eliminados. No modifica el resultado esperado, no reemplaza un fallo por timeout y no elimina entradas ajenas. El tiempo de fase posterior queda en la evidencia.

## Motion

El diagnóstico del run 35056199048, job 104672219447, comparó las mismas interacciones reales con/sin grabación y con/sin el filtro del backdrop que cubría toda la ventana. Sin grabación, el p95 de animación de la paleta pasó de 50 ms a 16,7 ms al retirar SOLO ese filtro. Con grabación pasó de 66,6 ms a 16,7 ms. Son datos de un diagnóstico en Xvfb, no una certificación del candidato nuevo.

La UI conserva la superficie de vidrio, sus bordes, sombras y animación. El fondo de separación se oscurece sin volver a filtrar toda la ventana por cada frame. El cambio se aplica al producto, no mediante inyección de CSS en la aceptación final.

## Inicio útil sin inventar estado

El composer de borrador puede utilizarse antes de que se cargue el motor. El espacio ya fue elegido y canonizado por Electron main; no se fabrican goals, agentes ni snapshots. Enviar permanece deshabilitado hasta la conexión real. Texto en memoria por workspace, no archivos ni localStorage; el borrador sobrevive a la hidratación y a la navegación. El benchmark conserva su reloj externo antes de spawn y registra por separado la conexión del motor.

Una regresión suspende el proceso Node real de la carpeta temporal, escribe un borrador con el motor aún desconectado, reanuda el proceso y verifica que el texto permanezca y que no se haya creado una goal. El siguiente candidato requiere CI completa; este documento no declara aprobadas pruebas futuras.
