# Perfect V4 · habilidades, pruebas y entrega

Perfect conserva el Goal Loop, el Judge, el aislamiento y la interfaz española. Esta entrega añade selección de habilidades por versión, un creador con revisión separada, comparación A/B, Blender aislado y diagnóstico local. Las cuentas personales no se conectan por publicar este repositorio.

## Uso visual

Abrí `perfect`. `/habilidades` muestra el interruptor general y el modo de selección. En **manual**, abrí una habilidad, inspeccioná la versión, habilitala para sus equipos y elegí **Seleccionar manualmente**. La confirmación enumera el hash y las dependencias. Una selección vacía no aporta skills; un paquete desactivado o una exclusión de equipo prevalece. Una skill global está disponible para todos, pero no se carga siempre.

`/equipos` gestiona pertenencia y exclusiones; `/perfiles` cambia proveedor/modelo/cuenta/reasoning sin modificar permisos. `/modos`, `/juegos` y `/motion` conservan sus presets. Superpowers sigue desactivado y no se incorporan hooks suyos. Los backends nuevos que requieren persistencia usan servicio propio y PostgreSQL; contenido estático y juegos offline no reciben un backend innecesario.

Cambiar selección o permisos invalida sesiones activas, incluso un apagado y encendido rápidos. No elimina código ni evidencia. Una sesión que leyó una instrucción necesita un contexto nuevo: pausá, adoptá los perfiles mediante `/adoptar-perfiles` y reanudá cuando corresponda. No se reescribe el historial de modelos ni los snapshots anteriores.

## Crear una habilidad sin editar JSON

`/crear-skill` abre un formulario: identificador, equipo, problema, activadores/exclusiones, entradas, salida, comprobación y licencia de contenido propio. La creación usa el agente configurado y por tanto requiere cuenta y cuota autorizadas. El paquete es un borrador, no una skill aprobada.

Al completar la goal por el Judge, elegí **Recopilar borrador terminado** en `/habilidades`. Se verifica el candidato exacto y su autoría. La copia entra en cuarentena; no se activa ni asigna. Inspeccioná sus archivos/licencia, proponé una evaluación y después decidí por separado si aprobar esa versión para producción. La evaluación de un borrador no exige activarlo primero.

## Comparación A/B

Desde una habilidad se puede proponer una evaluación de **respuestas** o **código**. El formulario divide desarrollo y casos reservados. `/evaluaciones` permite autorizar el contrato, ejecutarlo, cancelar y revisar la evidencia. Proponer no envía inferencias; ejecutar consume la cuota explícita del perfil. Las rutas por token no se habilitan silenciosamente.

Cada condición tiene sesión y workspace independientes, el mismo binding y límites equivalentes. RESPONSE compara respuestas; CODE ejecuta una función ESM dentro del sandbox y compara sus resultados con valores esperados que no están en el contexto del agente. Este primer formulario CODE cubre funciones numéricas pequeñas; la CLI admite argumentos/resultados JSON y varias entradas por caso. No es una certificación general de aplicaciones, diseño o seguridad.

Ambos pasan significa que ambos cumplen, no mejora demostrada. Sin-skill falla y candidata pasa es una mejora observada en ese caso. Si la candidata falla, el resultado de calidad falla aunque la referencia también falle. Los errores de infraestructura quedan incompletos, no como falsos éxitos. Los mocks de CI comprueban el evaluador, no la calidad real de Grok, Muse o Astra.

Una evaluación interrumpida conserva cuotas, reservas, resultados completos y tiempo activo. **Recuperar** requiere confirmar que el controlador anterior terminó y reconciliar sus procesos antes de soltar locks. No repite una llamada incierta ni reinicia los contadores.

## Blender

La preparación es explícita y externa al instalador:

```sh
node scripts/prepare-blender.mjs --allow-network
```

Ese script, desde el checkout de esta versión, descarga Blender 4.5.13 del origen oficial, comprueba su SHA256 publicado y construye la imagen local. Requiere Docker con contenedores Linux y acceso a descargas públicas. No instala Adobe/Unity ni modifica el Blender personal.

`perfect validacion blender --yes` o `/validacion` ejecuta el fixture: script creador aislado, fuente `.blend`, reapertura en otro contenedor mediante script del controlador, export GLB, carga con Three.js/Chromium y comprobación del PNG. El script creador no genera su propio certificado de éxito. No hay red dentro de los procesos de render ni fallback Python host. Los artifacts son salidas verificadas, no cambios aplicados automáticamente al checkout original.

La carga GLB en Three.js no demuestra compatibilidad con un importador Unity. El driver comprueba geometría/recursos y una captura no vacía; el juicio artístico y los criterios de una goal siguen siendo independientes.

## Validación de tu instalación

`/validacion` y `perfect validacion` distinguen implementado, detectado, configurado, autorizado, autenticado, invocado y verificado. El diagnóstico normal no hace inferencias. Las pruebas reales de perfiles se autorizan una a una, con datos sintéticos y sin enviar el proyecto. Contributor pide permiso explícito.

```sh
perfect validacion perfil backend --yes
perfect validacion exportar
```

El informe exportado contiene estados y versión/commit, no claves, prompts ni registros privados. Un reporte local aportado no es una atestación criptográfica independiente. Cambiar de versión/ruta exige volver a validar.

Unity tiene un preset MCP de proyecto autorizado; compilación/Play Mode/build deben comprobarse en un Editor real. After Effects, Rive y Cavalry no tienen aquí un adaptador de autoría completo: se muestran como no implementados, no como “faltan credenciales”. Dashi sigue pendiente de licencia. No se incluye una API comercial de generación de imágenes; se puede trabajar con referencias aportadas. Consultá `unity.md` e `integraciones.md` para límites de esos servicios.

## Windows

El instalador x64 y el portable se publican separados como artifacts del commit comprobado. Incluyen Node, módulos nativos y licencia del contenido redistribuido. El portable necesita su carpeta completa, no solo Perfect.exe. No se incluye Blender ni la colección local de Transitions, Dashi, fuentes tipográficas privadas, OAuth o datos del usuario.

La prueba automatizada instala una versión anterior real con datos sintéticos, actualiza a V4 y verifica SQLite, snapshots, skills, preferencias y credenciales DPAPI antes de desinstalar. La desinstalación conserva los datos de usuario. El perfil de Windows Terminal es un fragmento propio, no una edición destructiva de settings.json.

Los binarios no están firmados con Authenticode. SHA256 comprueba integridad, no identidad del editor. No desactives protecciones del sistema. Windows Server 2025 CI no equivale a una sesión Windows 11 de tu PC; Docker Desktop/WSL y tus cuentas se validan localmente.

## Evidencia y alcance

Los reports definitivos se vinculan al commit realmente checkout en Actions y a los hashes de los instaladores. Las capturas del renderizador nativo están marcadas DEMO; las capturas de Windows Terminal son pixels del programa real con ese fixture. Ninguna de ellas prueba inferencias de cuentas personales.

Los hitos históricos de `v4-*-validation.md` no sustituyen las comprobaciones del HEAD final. La PR sigue revisable sin merge ni despliegue automático.
