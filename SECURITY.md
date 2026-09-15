# Modelo de seguridad

## Fronteras

Perfect mantiene el control plane (SQLite, Pi, OAuth, políticas) fuera del source y de la ejecución. Los comandos del proyecto se ejecutan en contenedores no privilegiados, con red deshabilitada, capacidades eliminadas, `no-new-privileges`, root filesystem de solo lectura y límites de procesos/memoria/CPU. Solo reciben una copia saneada del source y un directorio temporal. No reciben sockets Docker, directorio HOME del usuario, Git config ni variables completas del host.

El navegador corre separado del servidor, en una red Docker interna sin salida externa. Usa el alias reservado `perfect-app.test`, evitando el HSTS de `.app`. Verificadores y sus drivers no se cargan desde el repo del usuario. Scripts del proyecto no pueden falsificar la salida del runner editando el driver o SQLite.

La CLI utiliza Git/Docker en el host para administrar recursos. Tener acceso al daemon Docker es un privilegio importante: ejecutar como usuario normal en una máquina confiable. La separación de contenedores no es una defensa absoluta ante un kernel o daemon comprometido.

## Archivos y permisos

Los workers escriben por un broker con ownership exclusivo, rutas relativas canónicas, comprobación de symlinks/hardlinks, tamaño y rutas protegidas. No acceden a `.env*`, `.ssh`, claves PEM, credenciales, `.npmrc`, `.git`, estado de Perfect ni carpetas externas. Renames/eliminaciones requieren permisos y verificación de hash. Los snapshots omiten rutas sensibles y registran lo omitido; se verifica la integridad al copiarlos.

Planner y reviewers no reciben herramientas de escritura ni shell arbitrario. Los logs y documentos del proyecto son datos, no instrucciones capaces de ampliar privilegios. Pi se inicializa con recursos confiables explícitos: no se ejecutan extensiones/skills/scripts encontrados automáticamente en el repositorio.

El source original y su index Git permanecen intactos. `apply --yes` es autorización separada y requiere DONE, evidencia del candidato actual y fingerprints sin divergencia. Un apply interrumpido no se repite a ciegas.

## Entrenamiento / Contributor / secretos

Muse Contributor puede utilizar prompts/respuestas para entrenamiento. Requiere consentimiento local por workspace y goal pública. La clasificación de una task solo puede elevar la privacidad. Se consulta nuevamente el consentimiento antes de cada solicitud: revocarlo impide solicitudes nuevas, no deshace las anteriores.

La detección de patrones de secretos es defensa adicional, **no un detector universal de datos personales o información confidencial**. Revisar el workspace antes de clasificarlo público. No enviar código privado de clientes ni datos reales de producción. Los artifacts/sesiones pueden contener código y datos del proyecto; conservarlos localmente y no subirlos indiscriminadamente.

Tokens en archivos locales de cuenta con permisos restrictivos. Nunca en Git, configuración versionada, payload de tarea, issue o CI. No se captura Authorization en telemetry. La observación SSE conserva identidad/uso, no almacena una segunda copia del contenido del modelo. Las sesiones Pi sí mantienen su conversación necesaria para auditoría: tratarlas como información sensible.

## Dependencias y red

`prepare --allow-network` es una operación explícita, ejecutada en un sandbox, con proxy que permite únicamente el registro público npm. Rechaza dependencias por URL, Git, rutas locales, overrides/workspaces y registries alternativos; no ejecuta lifecycle scripts. No admite credenciales de registro. La imagen preparada se vincula a hashes de manifests y se ejecuta por ID inmutable. Un manifest distinto necesita otra preparación.

Herramienta de investigación deshabilitada por defecto. `permissions.researchHosts` permite hosts exactos revisados. Solo HTTPS, DNS público fijado para la conexión, redirects revalidados, sin cookies/Authorization, límites de bytes y tiempo. No permite localhost, redes privadas o endpoints de metadata.

## Alcance y reporte

No incluye hardening de infraestructura multiusuario, VM dedicada, aislamiento de un host ya comprometido, DLP completo ni garantías de que las dependencias sean benignas. Worktrees son aislamiento de versiones, no un sandbox.

No publicar secretos ni reproducciones con datos personales en issues públicos. Para un fallo sin datos sensibles, incluir commit, plataforma, pasos mínimos y error saneado. Para datos sensibles, contactar al dueño del repositorio por un canal privado antes de compartir detalles.
