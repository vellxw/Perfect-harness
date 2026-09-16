# Correcciones del método de medición, no resultados fabricados

La ejecución 35050273085 del commit e47ee227dcc45e0be29092eee95b1fa18500f479 midió 1940 ms en el peor percentil de diez arranques fríos, 1190 ms en la primera muestra llamada caliente (las otras nueve: 720–758 ms) y aproximadamente 803 MiB al sumar RSS de siete procesos. Los límites de 2 s / 1 s / 450 MiB no se aumentan.

## Arranque caliente

La primera muestra «reused-user-data» del experimento antiguo creaba por primera vez reused-home. Por tanto no era una reapertura. El experimento corregido reutiliza el directorio de la última ejecución fría, que sigue registrada íntegra en la serie fría. No se descarta una muestra lenta: se clasifica correctamente su condición y se toman diez reaperturas independientes. La caché de compilación de Node es una optimización del producto introducida anteriormente; la corrección del experimento no es otra optimización.

## Memoria multiproceso

RSS es la memoria residente de cada proceso, incluida la memoria compartida. Su suma no equivale a la asignación física del conjunto: las páginas de código Electron/Chromium se cuentan repetidas en main, zygotes, GPU, utilidades y renderers. El benchmark nuevo registra **todos los mismos procesos**, incluidos el motor Node y cualquier renderer auxiliar. Conserva RSS por PID y su suma, así como la comparación histórica contra 450 MiB con el resultado PASS/FAIL que corresponda.

La comprobación de memoria atribuible utiliza `Pss + SwapPss` de `/proc/PID/smaps_rollup`, para repartir páginas compartidas y no ocultar consumo en swap. No se utiliza renderer-only ni memoria privada excluyendo el resto del producto. Una lectura inaccesible bloquea la medición; no se convierte en cero. En CI, una lectura restringida del rollup de un PID hijo comprobado puede usar `sudo cat` como diagnóstico externo de solo lectura; la aplicación ensayada no cambia de privilegios ni de sandbox.

Esto es una corrección de la métrica, **no una reducción demostrada de 803 a otra cifra**. Los informes de release deben mostrar ambos números y la versión del método. PSS no puede reconstruirse retroactivamente a partir de una suma RSS. Las cifras Windows se informan con su propio método, no como equivalencias asumidas.

Referencias primarias consultadas 2026-09-16:
- https://docs.kernel.org/filesystems/proc.html (Pss, Rss, smaps_rollup y SwapPss).
- https://www.electronjs.org/docs/latest/api/structures/process-memory-info (residentSet/private/shared).

La prueba de estabilidad de treinta minutos ahora se ejecuta aunque un presupuesto previo falle. El resultado final sigue siendo FAIL si falta un criterio; ejecutar el soak no convierte por sí solo en PASS el rendimiento.
