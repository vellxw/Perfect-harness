/** Traducción de mensajes conocidos del núcleo. No se aplica a código, parches ni evidencia. */
const messages: Readonly<Record<string, string>> = {
  "Snapshot exceeds configured limit":
    "La copia inicial supera el límite configurado",
  "Reviewed candidate was modified; re-verification is required":
    "La versión revisada fue modificada; es necesario verificarla de nuevo",
  "Source/control overlap":
    "La carpeta original se superpone con la carpeta de control",
  "Original workspace or index changed; refusing automatic apply":
    "La carpeta original o el índice de Git cambiaron; se impide la aplicación automática",
  "Provider payload is not observable":
    "No se puede observar el contenido enviado al proveedor",
  "Contributor routes require public classification and explicit workspace consent":
    "Las rutas Contributor requieren un objetivo público y consentimiento explícito de la carpeta",
  "Subscription route must use OAuth": "La ruta de suscripción debe usar OAuth",
  "Catalog does not identify a free model":
    "El catálogo no identifica un modelo gratuito",
  "Agent turn limit reached": "Se alcanzó el límite de turnos del agente",
  "Hard token admission requires an observable output cap and text-only request":
    "El límite estricto de tokens requiere un máximo de salida observable y una solicitud solo de texto",
  "Result already submitted; no more mutations allowed":
    "El resultado ya fue enviado; no se permiten más modificaciones",
  "Agent ended without a validated structured submission":
    "El agente terminó sin una respuesta estructurada validada",
  "Pi changed model/provider/reasoning":
    "Pi cambió el modelo, el proveedor o el nivel de razonamiento",
  "Malformed service token counters":
    "Los contadores de tokens del servicio son inválidos",
  "Malformed reasoning token count":
    "El contador de tokens de razonamiento es inválido",
  "Provider event exceeds bounded transport buffer":
    "El evento del proveedor supera el límite de transporte",
  "Provider request changed its authorized origin":
    "La solicitud del proveedor cambió su origen autorizado",
  "Expected SSE; refusing an unaudited successful provider response":
    "Se esperaba SSE; se rechazó una respuesta del proveedor que no pudo auditarse",
  "Expected a JSON object": "Se esperaba un objeto JSON",
  "V1 preparation supports a root npm project without workspaces, overrides or alternate resolutions. Use an explicitly prepared trusted image for other layouts.":
    "La preparación admite un proyecto npm raíz sin workspaces, overrides ni resoluciones alternativas. Para otras estructuras, usá una imagen confiable preparada explícitamente.",
  "Lockfile nesting exceeds the supported limit":
    "El anidamiento del archivo de dependencias supera el límite admitido",
  "Linked dependencies are not allowed in preparation":
    "No se permiten dependencias enlazadas durante la preparación",
  "Non-registry dependency in lockfile":
    "El archivo de dependencias contiene una dependencia ajena al registro",
  "Only HTTPS registry.npmjs.org tarballs are allowed":
    "Solo se permiten paquetes HTTPS de registry.npmjs.org",
  "Manifest is oversized or contains a detected secret":
    "El manifiesto es demasiado grande o contiene un secreto detectado",
  "Lockfile exceeds 20 MB": "El archivo de dependencias supera los 20 MB",
  "Preparation downloads public npm packages. Pass --allow-network explicitly after reviewing the manifests.":
    "La preparación descarga paquetes públicos de npm. Revisá los manifiestos y autorizá la red explícitamente con --permitir-red.",
  "Pause the goal before preparing dependencies":
    "Pausá el objetivo antes de preparar las dependencias",
  "Select a paused task with an existing managed worktree":
    "Seleccioná una tarea pausada con una copia de trabajo administrada existente",
  "Task preparation requires explicit package-lock.json ownership in its accepted plan. Prepare the integrated candidate instead.":
    "La preparación de una tarea requiere que el plan le asigne explícitamente package-lock.json. En su lugar, prepará la versión candidata integrada.",
  "This root package declares no external dependencies":
    "El paquete raíz no declara dependencias externas",
  "Unsupported Docker mount path": "Ruta de montaje de Docker no admitida",
  "Generated lockfile exceeds limit":
    "El archivo de dependencias generado supera el límite",
  "Docker is unreachable; cleanup must be reconciled on resume":
    "Docker no es accesible; la limpieza debe reconciliarse al reanudar",
  "Docker is unavailable; no host-shell fallback is permitted":
    "Docker no está disponible; no se permite ejecutar comandos directamente en el equipo como alternativa",
  "Cannot reconcile containers while Docker is unavailable":
    "No se pueden reconciliar los contenedores mientras Docker no esté disponible",
  "V1 browser targets must be PNG":
    "Las referencias de navegador de V1 deben ser PNG",
  "Database belongs to a newer harness; refusing downgrade":
    "La base de datos pertenece a una versión posterior; no se permite abrirla con una anterior",
  "SQLite transactions must be synchronous":
    "Las transacciones de SQLite deben ser síncronas",
  "Invalid read range": "Rango de lectura inválido",
  "Line exceeds tool budget; request a scoped refactor or inspect a non-minified source":
    "La línea supera el límite de la herramienta; pedí una revisión acotada o inspeccioná el código sin minimizar",
  "Only scoped text evidence may be read":
    "Solo puede leerse evidencia de texto dentro del alcance autorizado",
  "Real goals cannot use a simulated route":
    "Los objetivos reales no pueden usar una ruta simulada",
  "Workspace consent was revoked during execution":
    "Se revocó el consentimiento de la carpeta durante la ejecución",
  "Reservations require finite nonnegative bounds":
    "Las reservas de presupuesto requieren límites finitos y no negativos",
  "Duplicate request reservation": "Reserva de solicitud duplicada",
  "Goal not found": "No se encontró el objetivo",
  "Provider request limit reached":
    "Se alcanzó el límite de solicitudes al proveedor",
  "Pay-per-token routes are disabled":
    "Las rutas de pago por token están deshabilitadas",
  "Cannot enforce a monetary bound on this request":
    "No se puede garantizar un límite monetario para esta solicitud",
  "Admission would exceed budget": "La solicitud superaría el presupuesto",
  "Cannot settle invalid token counters":
    "No se puede contabilizar un consumo con contadores de tokens inválidos",
  "Cannot settle invalid cost": "No se puede contabilizar un costo inválido",
  "Narrow the task/context package before invocation":
    "Reducí el alcance de la tarea o su contexto antes de ejecutarla",
  "Repair lineage cycle": "Ciclo detectado en la cadena de reparaciones",
  "Remove credentials from the goal before submitting it":
    "Quitá las credenciales del objetivo antes de enviarlo",
  "A nonempty goal is required": "El objetivo no puede estar vacío",
  "Perfect state must be outside the source workspace":
    "El estado de Perfect debe guardarse fuera de la carpeta original",
  "Unknown goal": "Objetivo desconocido",
  "Goal has no accepted plan": "El objetivo no tiene un plan aceptado",
  "No accepted task owns the failing criterion":
    "Ninguna tarea aceptada tiene asignado el criterio que falla",
  "Review has no repair owner":
    "La revisión no tiene una tarea responsable de repararla",
  "Restart planning safely": "Reiniciar la planificación de forma segura",
  "Reconcile and resume from a scheduling boundary":
    "Reconciliar y reanudar desde un punto seguro de asignación",
  "Previous task attempt failed": "Falló el intento anterior de la tarea",
  "No runnable tasks; inspect dependencies and ownership":
    "No hay tareas listas; revisá sus dependencias y áreas asignadas",
  "Persisted configuration fingerprint mismatch":
    "La huella de la configuración guardada no coincide",
  "User requested abort": "El usuario solicitó cancelar el objetivo",
  "Execution paused at a recoverable boundary":
    "Ejecución pausada en un punto recuperable",
  "Planner invocation limit reached":
    "Se alcanzó el límite de invocaciones del planificador",
  "Managed candidate has uncheckpointed changes; inspect it before resuming":
    "La versión administrada tiene cambios sin guardar; inspeccionala antes de reanudar",
  "Candidate changed without a recorded integration intent":
    "La versión candidata cambió sin una intención de integración registrada",
  "An interrupted apply needs explicit inspection of the source checkout":
    "Una aplicación interrumpida requiere inspeccionar explícitamente la carpeta original",
  "Candidate changed during an interrupted integration":
    "La versión candidata cambió durante una integración interrumpida",
  "Recovered diff is outside task ownership":
    "Los cambios recuperados exceden el área asignada a la tarea",
  "Controller restarted": "Controlador reiniciado",
  "Interrupted attempt; inspect checkpoint before continuing":
    "Intento interrumpido; revisá el punto de recuperación antes de continuar",
  "Required review cannot be skipped to finish":
    "No se puede omitir una revisión obligatoria para terminar",
  "A visual review must inspect actual images":
    "Una revisión visual debe inspeccionar imágenes reales",
  "Split the visual scenario: image budget exceeded":
    "Dividí el escenario visual: se superó el límite de imágenes",
  "Invalid semaphore capacity": "Capacidad de concurrencia inválida",
  "Repair evidence exceeds image budget":
    "La evidencia de reparación supera el límite de imágenes",
  "No produced task checkpoint": "La tarea no produjo un punto de recuperación",
  "candidate changed": "La versión candidata cambió",
  "Integration changed Git before state was committed; resume must reconcile":
    "La integración modificó Git antes de guardar el estado; es necesario reconciliar al reanudar",
  "No goal exists for this workspace. Specify its id.":
    "No hay objetivos para esta carpeta. Indicá el identificador de uno.",
  "Generate and inspect a plan first": "Primero generá e inspeccioná un plan",
  "Only explicitly human-reviewed criteria accept this approval":
    "Solo los criterios de revisión humana explícita aceptan esta aprobación",
  "Pause the goal before retrying. Terminal goals are immutable; create a new continuation goal instead.":
    "Pausá el objetivo antes de reintentar. Los objetivos finalizados son inmutables; creá un nuevo objetivo de continuación.",
  "Retry cannot reset task or lineage counters":
    "El reintento no puede reiniciar los contadores de la tarea ni de sus reparaciones",
  "Review perfect diff, then explicitly pass --yes":
    "Revisá perfect cambios y autorizá explícitamente con --si",
  "Only an evidence-complete candidate can be applied by V1. Partial work remains available in its managed repository.":
    "Solo puede aplicarse una versión con toda la evidencia requerida. El trabajo parcial sigue disponible en el repositorio administrado.",
  "An earlier apply was interrupted. Inspect the original checkout; no automatic replay is permitted.":
    "Se interrumpió una aplicación anterior. Inspeccioná la carpeta original; no se permite repetirla automáticamente.",
  "Run perfect trust-config after reviewing perfect.config.json":
    "Ejecutá perfect confiar-config después de revisar perfect.config.json",
  "Missing candidate revision": "Falta la revisión de la versión candidata",
  "Plan does not belong to the current goal":
    "El plan no pertenece al objetivo actual",
  "Plan fingerprint is invalid": "La huella del plan es inválida",
  "Acceptance contract changed": "El contrato de aceptación cambió",
  "Evidence artifacts missing or modified":
    "Faltan archivos de evidencia o fueron modificados",
  "Route integrity not verified":
    "La integridad de la ruta del modelo no está verificada",
  "Task graph membership is inconsistent":
    "Las tareas no coinciden con el grafo aceptado",
  "Only evidence Judge can complete a goal":
    "Solo el evaluador de evidencia puede completar un objetivo",
  "Command required": "Se requiere un comando",
  "Scenario required": "Se requiere un escenario",
  "Remotion specification required":
    "Se requiere una especificación de Remotion",
  "Duplicate plan identifiers": "Identificadores de plan duplicados",
  "Unknown criterion or verification": "Criterio o verificación desconocidos",
  "Frontend must route to frontend specialist":
    "La interfaz debe asignarse al especialista de interfaz",
  "Backend must route to backend specialist":
    "El servidor debe asignarse al especialista de servidor",
  "Task graph contains a cycle": "El grafo de tareas contiene un ciclo",
  "Check refers to unknown criterion":
    "La comprobación se refiere a un criterio desconocido",
  "Replan cannot replace accepted criteria/verifiers":
    "La replanificación no puede sustituir criterios ni verificadores aceptados",
  "Expected PNG, JPEG or WebP bytes":
    "Se esperaban datos de una imagen PNG, JPEG o WebP",
  "Existing tests/references cannot be modified by a worker":
    "Los agentes no pueden modificar pruebas ni referencias existentes",
  "Only text documentation is supported":
    "Solo se admite documentación de texto",
  "Reference exceeds 200 KB": "La referencia supera los 200 KB",
  "Private or ambiguous destination": "Destino privado o ambiguo",
  "Redirect without location": "Redirección sin destino",
  "Too many documentation redirects":
    "Demasiadas redirecciones de documentación",
  "Unclosed quote or escape": "Comilla o secuencia de escape sin cerrar",
  "Image input probe returned incorrect colors":
    "La prueba de imagen devolvió colores incorrectos",
  "No successful tool execution was observed":
    "No se observó una ejecución exitosa de la herramienta",
  "configured, not tested": "configurado, no probado",
  "not observed": "no observado",
  "not reported": "no informado",
  unknown: "desconocido",
  "API key": "Clave API",
  "Enter API key": "Ingresá la clave API",
  "Enter your API key": "Ingresá tu clave API",
  "Paste the authorization code": "Pegá el código de autorización",
  "Paste the redirect URL": "Pegá la URL de redirección",
  "Open this URL in your browser": "Abrí esta URL en tu navegador",
};
const prefixes: Readonly<Record<string, string>> = {
  "Snapshot changed during copy: ":
    "La copia inicial cambió durante la lectura: ",
  "Only public npm registry version selectors are allowed: ":
    "Solo se admiten versiones del registro público de npm: ",
  "Pull the approved image explicitly first: ":
    "Primero descargá explícitamente la imagen autorizada: ",
  "Install the approved image explicitly: ":
    "Instalá explícitamente la imagen autorizada: ",
  "Installation failed; inspect ": "Falló la instalación; inspeccioná ",
  "Dependency image commit failed: ":
    "Falló la creación de la imagen de dependencias: ",
  "Immutable record: ": "Registro inmutable: ",
  "Protected ownership requested: ": "Se solicitó acceso a un área protegida: ",
  "Visual criterion requires captures: ":
    "El criterio visual requiere capturas: ",
  "Planner omitted required configured verifier: ":
    "El planificador omitió un verificador obligatorio: ",
  "Necessary task not accepted for this plan: ":
    "Hay una tarea necesaria sin aceptar en este plan: ",
  "Stale dependency output: ": "Resultado de dependencia desactualizado: ",
  "Verification not passed with current evidence: ":
    "Verificación sin aprobar con evidencia actual: ",
  "Human approval required: ": "Se requiere aprobación humana: ",
  "No passing runner evidence for: ":
    "No hay evidencia aprobada del ejecutor para: ",
  "Required review not approved: ": "Revisión obligatoria sin aprobar: ",
  "Terminal goal cannot transition: ":
    "Un objetivo finalizado no puede cambiar de estado: ",
  "Illegal transition ": "Transición no permitida ",
  "Invalid dependency: ": "Dependencia inválida: ",
  "Task has no ownership: ": "La tarea no tiene un área asignada: ",
  "Uncovered criterion: ": "Criterio sin cubrir: ",
  "Unverified criterion: ": "Criterio sin verificar: ",
  "Invalid ownership surface: ": "Área asignada inválida: ",
  "Task status is ": "El estado de la tarea es ",
  "Documentation HTTP ": "Documentación HTTP ",
  "Run perfect login ": "Ejecutá perfect conectar ",
};
export function humanMessage(value: string): string {
  if (messages[value] !== undefined) return messages[value]!;
  const prefix = /^(Error: )?([A-Z][A-Z0-9_]+): ([\s\S]*)$/.exec(value);
  if (prefix) return `${prefix[2]}: ${humanMessage(prefix[3]!)}`;
  if (value.startsWith("Error: "))
    return `Error: ${humanMessage(value.slice(7))}`;
  for (const [from, to] of Object.entries(prefixes))
    if (value.startsWith(from)) return to + value.slice(from.length);
  const cooldown =
    /^Provider requests (\d+) seconds of cooldown; resume after that interval$/.exec(
      value,
    );
  if (cooldown)
    return `El proveedor requiere ${cooldown[1]} segundos de espera; reanudá después de ese plazo`;
  const approval =
    /^Inspect perfect plan, then run perfect approve-plan (\S+) and perfect resume (\S+)$/.exec(
      value,
    );
  if (approval)
    return `Revisá perfect plan; luego ejecutá perfect aprobar-plan ${approval[1]} y perfect reanudar ${approval[2]}`;
  const dependency =
    /^No approved dependency image matches these manifests\. Pause and run perfect prepare (\S+) --allow-network\. Native lifecycle scripts are never executed by preparation\.$/.exec(
      value,
    );
  if (dependency)
    return `No hay una imagen de dependencias autorizada para estos manifiestos. Pausá y ejecutá perfect preparar ${dependency[1]} --permitir-red. La preparación nunca ejecuta scripts de instalación nativos.`;
  const route = /^Requested (.+); service reported (.+)$/.exec(value);
  if (route)
    return `Solicitado: ${route[1]}; informado por el servicio: ${route[2]}`;
  const serialized = /^Expected (.+), serialized (.+)$/.exec(value);
  if (serialized)
    return `Esperado: ${serialized[1]}; serializado: ${serialized[2]}`;
  const controller = /^Another controller \((\d+)\) owns this workspace$/.exec(
    value,
  );
  if (controller)
    return `Otro controlador (${controller[1]}) está usando esta carpeta`;
  const stop =
    /^Cannot establish whether (.+) stopped; keep ownership until recovery$/.exec(
      value,
    );
  if (stop)
    return `No se puede confirmar que ${stop[1]} se haya detenido; se conserva la asignación hasta recuperar el proceso`;
  // Los mensajes externos desconocidos se conservan: nunca se inventa una traducción ni se altera evidencia.
  return value;
}
