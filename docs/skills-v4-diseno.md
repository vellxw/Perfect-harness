# Skills y equipos: fronteras de V4

Una responsabilidad del núcleo (planner/general/frontend/backend/oracle/integrator/visual) no es un perfil. Los perfiles tienen ID propio, equipos y modelo; las tareas seleccionan un perfil registrado compatible con su responsabilidad. Cambiar el modelo no modifica permisos ni conocimientos. Los modos coordinan perfiles, no crean otro Goal Loop.

Global significa disponible, no inyectado siempre. Se filtra antes del prompt. El interruptor off y una denegación de paquete prevalecen; una exclusión por equipo/perfil prevalece sobre activación global. Superpowers está desactivado desde el inicio. Una referencia explícita no evita estas comprobaciones.

Paquetes y recursos viven en el control plane, no se monta la biblioteca entera en los worktrees. Se conserva hash de archivos, procedencia, licencia, revisión y activación. Scripts requieren la herramienta aislada; `allowed-tools` es información, no autorización. La desactivación no borra texto del historial: una sesión contaminada debe reiniciarse.

Documentos importados no son instrucciones de autoridad. Las metas y evidencias del Judge prevalecen. PostgreSQL y ausencia de backend como servicio son preferencias independientes de skills. No generan backend donde no se requiere.

Formato revalidado: https://agentskills.io/specification (2026-09-14). El parser usa YAML con claves únicas y sin aliases. No se ejecutan instaladores/hook scripts al importar. Transitions.dev se importa localmente según términos; no se incluye su colección en este repositorio ni en el instalador. Dashi queda pendiente de licencia; no se copia su contenido.
