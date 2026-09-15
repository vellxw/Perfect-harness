import { curatedSkills } from "./curated.js";
import { releaseFromFiles } from "./importer.js";
import type { SkillRelease } from "./model.js";

const OWN_LICENSE =
  "MIT License\nCopyright (c) 2026 Perfect Harness contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to inclusion of this copyright and permission notice. THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND.\n";
const DREAM_NOTICE =
  "Adaptación de Dream Loop. MIT License\nCopyright (c) 2026 Anshu Chimala\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the Software), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n";
interface Builtin {
  id: string;
  description: string;
  sets: string[];
  triggers: string[];
  body: string;
  references?: Record<string, string>;
  notice?: string;
}
const definitions: Builtin[] = [
  {
    id: "perfect-postgres-backend",
    description:
      "Servicio propio con PostgreSQL: contratos, migraciones, transacciones y pruebas reales. No se usa en contenido estático ni juegos offline.",
    sets: ["backend"],
    triggers: [
      "backend",
      "postgres",
      "persistencia",
      "sql",
      "api",
      "migraci",
      "reservas",
      "transaction",
    ],
    body: `# Backend PostgreSQL propio

1. Leé contrato, esquema existente y pruebas. Para proyectos nuevos TypeScript, elegí Fastify + pg + migraciones SQL. No migres un stack funcional sin pedirlo.
2. Modelá invariantes con NOT NULL, CHECK, UNIQUE y claves foráneas; no dependas solo de validar antes de insertar. Definí errores de conflicto y entradas inválidas.
3. Consultas parametrizadas ($1, $2). Nunca concatenes valores del cliente. Los nombres de columna dinámicos requieren una allowlist del controlador.
4. Creá un pool compartido por proceso con cierre ordenado. Una transacción usa EL MISMO cliente desde BEGIN hasta COMMIT/ROLLBACK y lo libera en finally.
5. Mantené migraciones ordenadas con checksum e historial. Probá instalación vacía y actualización de un fixture previo. No ejecutes migraciones sobre producción desde la goal.
6. Verificá autorización por operación/recurso, concurrencia y persistencia tras reiniciar. No escribas criptografía propia ni registres secretos.
7. Medí antes de indexar u optimizar. Un servicio modular es la base: colas/caché distribuida/microservicios exigen un problema concreto.
8. Probá contra PostgreSQL REAL temporal y aislado. SQLite no demuestra equivalencia de SQL/concurrencia. Un test aprobado por imprimir texto no cuenta.

Consultá [transacciones](references/transactions.md) cuando haya operaciones compuestas.`,
    references: {
      "references/transactions.md":
        "PostgreSQL: https://www.postgresql.org/docs/18/transaction-iso.html\nRestricciones: https://www.postgresql.org/docs/18/ddl-constraints.html\npg: https://node-postgres.com/features/transactions\nConsultas: https://node-postgres.com/features/queries\nUna violación UNIQUE se maneja como conflicto, no como éxito. Un retry requiere idempotencia y un límite. No elijas serializable para todo sin justificarlo. Backup/restore se verifica sobre una base temporal con identificador de goal, nunca sobre bases ajenas.\n",
    },
  },
  {
    id: "perfect-frontend-quality",
    description:
      "Implementar frontend legible, responsive y verificable respetando el diseño aprobado, sin añadir una metodología de orquestación.",
    sets: ["frontend-web"],
    triggers: [
      "frontend",
      "react",
      "interfaz",
      "responsive",
      "landing",
      "component",
      "formulario",
    ],
    body: `# Interfaz según evidencia

Respetá la referencia y el diseño existente: jerarquía, tipografía, espaciado, estados y contraste. No inventes un dashboard o gradiente porque parece premium. Empezá por la estructura y los estados requeridos; agregá abstracciones cuando haya reutilización real.

Usá elementos semánticos, etiquetas de formularios, foco visible y navegación por teclado. Revisá carga/vacío/error/éxito y cambios rápidos de estado. En React evitá efectos que duplican estado derivable y solicitudes secuenciales innecesarias; comprobá el comportamiento con el framework del proyecto.

Build no valida aspecto. Ejecutá interacción en desktop/mobile y capturá estados pertinentes. Corregí overflow, clipping, consola y errores de foco. No cambies snapshots aprobados ni reduzcas checks para ocultar diferencias.

Referencias: https://react.dev/learn ; https://www.w3.org/WAI/tutorials/ ; https://playwright.dev/docs/intro .`,
  },
  {
    id: "perfect-beam-design",
    description:
      "Elegir e integrar border-beam gratuito en React DOM, con uso selectivo, contraste y movimiento reducido. No se utiliza en OpenTUI.",
    sets: ["frontend-web"],
    triggers: ["beam", "borde animado", "border glow", "borde luminoso"],
    body: `# Beam gratuito

Verificá el package border-beam y sus exports/tipos instalados antes de escribir props. La biblioteca pública es MIT; Studio, presets y material Pro no forman parte de esta habilidad. No requiere cuenta ni API.

Elegí una superficie significativa: foco, progreso o énfasis solicitado. No apliques beams a todas las cards. Conservá border-radius y contraste, y comprobá que el efecto no capture clics ni oculte focus rings.

Si prefers-reduced-motion está activo, sustituí movimiento continuo por borde estático o el estado discreto apropiado. Pausá o desmontá animaciones no visibles según API real. Probá cambios rápidos de props, tamaños pequeños y componentes deshabilitados.

Es React DOM: no importarlo dentro de la TUI OpenTUI ni asumir puerto nativo. No copiar ejemplos/presets Pro. Evidencia requerida: componente montado, interacción, captura y prueba reduced-motion.

API y fuente: https://github.com/Jakubantalik/Libraries.dev/tree/main/packages/border-beam
Licencia: https://libraries.dev/terms`,
  },
  {
    id: "perfect-remotion-motion",
    description:
      "Motion con Remotion: escenas, ritmo, continuidad, tipografía legible y render reproducible. No reemplaza editores nativos elegidos.",
    sets: ["motion"],
    triggers: [
      "remotion",
      "motion ad",
      "tipografia",
      "animacion",
      "video",
      "reel",
    ],
    body: `# Producción motion

Confirmá formato, FPS, duración, audio y referencia. Mantené branding y elementos aprobados. Diseñá beats y transiciones antes de detallar; el ritmo no se valida con el último frame.

En Remotion usá el frame/timeline como fuente de tiempo, sin Date.now, Math.random no fijado o timers del navegador para el render. Separá controles de texto/color/layout del cálculo de animación. No añadás librerías para movimientos que resuelve el runtime.

Renderizá frames de inicio, fin y puntos intermedios de cada transición; comprobá continuidad, clipping, easing, duración real y legibilidad. Renderizá también la entrega final. Un collage no demuestra fluidez; capturas sintéticas no son un video producido.

Entregá fuente editable y media por separado, con metadatos verificados. Si el usuario eligió AE/Rive/Cavalry, no sustituyas el formato por Remotion. Herramientas/editor sin configuración implican bloqueo explícito.

Documentación: https://www.remotion.dev/docs/renderer/render-still ; https://www.remotion.dev/docs/renderer/render-media .`,
  },
  {
    id: "perfect-gameplay",
    description:
      "Crear una porción jugable antes de ampliar el juego: controles, objetivo, estados, reinicio y pruebas. Respetar motor existente.",
    sets: ["gameplay"],
    triggers: [
      "juego",
      "game",
      "gameplay",
      "player",
      "colisi",
      "unity",
      "phaser",
      "godot",
    ],
    body: `# Gameplay primero

1. Identificá fantasía, verbos del jugador, objetivo, duración de sesión y plataforma. Respetá motor existente/elegido.
2. Construí una porción jugable mínima, no una arquitectura universal: input, movimiento, interacción principal, éxito/fallo y reinicio.
3. Separá estado de simulación y render solo donde aporte testabilidad. Usá timestep coherente y controlá input perdido al cambiar foco. Reiniciar limpia entidades, listeners y temporizadores.
4. Cámara y HUD deben permitir leer el juego. No pongas overlays sobre controles o área de juego.
5. Probá jugar, perder/ganar y reiniciar varias veces, además de compilar. Presupuesto de rendimiento se mide en el entorno objetivo identificado.
6. No agregar multijugador, cuentas, economía ni backend sin necesidad. Para backend online requerido: PostgreSQL propio.
7. Cuando cambien assets, comprobá escala, pivotes, colisiones e importación. Un render hermoso no es un juego funcionando.

Solicitá un perfil assets-3d o game-qa al scheduler cuando corresponda; no lances subagentes fuera de él.`,
  },
  {
    id: "perfect-game-qa",
    description:
      "Playtesting reproducible con evidencia de controles, transiciones, éxito/fallo, reinicio y rendimiento; no solo capturas.",
    sets: ["game-qa"],
    triggers: ["juego", "game", "playtest", "prueba", "test", "reinicio"],
    body: `# Pruebas de juego

Partí del contrato aceptado, no de la autoevaluación del implementador. Registrá versión del juego, motor, viewport, dispositivo/input, seed cuando sea aplicable y secuencia de acciones.

Probá inicio, controles, condición de victoria y derrota, pausa/reanudación si existe, reinicio y recuperación de foco. Buscá acumulación de listeners y estado que sobrevive por error al reinicio. Verificá colisiones y límites.

Medí rendimiento durante la interacción, no solamente en el menú. Diferenciá medición CI/headless de FPS en hardware del usuario.

Capturá evidencias de estados y secuencias. Reportá bug reproducible y resultado esperado/observado. No declares DONE por un screenshot; el Judge combina evidencia funcional y visual. No alteres condiciones de éxito ni tests de aceptación.`,
  },
  {
    id: "perfect-assets-3d",
    description:
      "Assets 3D con fuente editable, procedencia, pivotes, materiales y exportación probada en el motor destino.",
    sets: ["assets-3d"],
    triggers: ["3d", "blender", "asset", "modelo", "material", "textur", "glb"],
    body: `# Assets utilizables

Elegí por requisito visual y coste autorizado: fuente existente, modelado, procedural o generación autorizada. La presencia de una clave no autoriza gasto. Registrá licencia/origen y cambios por asset.

Conservá fuente .blend y un export runtime validado. Normalizá unidades, orientación, escala y pivotes. Revisá UV, materiales, transparencia, texturas, presupuesto de polígonos y colisiones. Simplificá sin destruir la silueta aprobada.

Blender Python es ejecución de código; solo por runner aislado y scripts autorizados. Desactivar autoejecución no aísla un script explícito.

Web: GLB/glTF con loader real del proyecto. Unity: elegir formato/importador realmente instalado y conservar .meta/GUID. No atribuir soporte a Unity por el nombre del archivo. Renderizar en Blender e importar en runtime son checks distintos.

Usá target visual fijo; para faltantes solicitá recursos en vez de copiar assets comerciales. Documentación primaria: https://docs.blender.org/manual/en/latest/ ; https://registry.khronos.org/glTF/ .`,
  },
  {
    id: "perfect-dream-loop",
    description:
      "Refinamiento 3D contra referencia fija mediante captura real, crítico independiente y repair del harness, sin gasto ni DONE propios.",
    sets: ["assets-3d"],
    triggers: [
      "dream loop",
      "dream-loop",
      "fidelidad",
      "referencia 3d",
      "calidad visual",
    ],
    notice: DREAM_NOTICE,
    body: `# Dream Loop adaptado a Perfect

Adaptación del procedimiento de https://github.com/achimala/dream-loop (MIT). No es una copia del routing Plus/Pro ni de su criterio numérico de finalización.

1. Usá la referencia aprobada. Si falta, solicitá una o una generación con proveedor/coste autorizados; no deduzcas acceso desde la suscripción de texto. Una imagen generada se etiqueta referencia, no captura del producto.
2. Fijá su hash y parámetros de captura. No cambies el target para ocultar diferencias.
3. Implementá y probá una versión del producto. Capturá desde el runtime real con cámara/viewport/estado reproducibles.
4. Solicitá crítica a un perfil de visión independiente a través del scheduler. Comparar composición, luz, materiales, silueta y detalles; findings localizados y accionables, no elogios generales.
5. Las reparaciones y el estancamiento entran al loop de Perfect y comparten sus límites. No abrir loops internos infinitos ni incrementar presupuesto.
6. El score visual es apoyo, nunca DONE. Verificar gameplay/interacción, errores y rendimiento además de apariencia.

La selección de assets respeta coste, derechos y objetivos. Procedural es una opción válida si cumple. Fal u otra generación externa requiere aprobación independiente; una credencial encontrada no la concede. El Judge de Perfect conserva toda la autoridad.`,
  },
  {
    id: "perfect-skill-author",
    description:
      "Borradores de habilidades por equipo con casos positivos/negativos, licencia, evaluación independiente y aprobación manual.",
    sets: ["general"],
    triggers: [
      "crear skill",
      "crear habilidad",
      "skill.md",
      "habilidad reutilizable",
    ],
    body: `# Estudio de habilidades

Definí el problema concreto, equipo destinatario, cuándo usar y cuándo NO usar, entradas y salida verificable. No conviertas un procedimiento particular en una metodología universal.

Escribí SKILL.md con name y description YAML válidos; directorio igual a name. Conservá metadatos propios en manifiesto lateral. Referencias enfocadas bajo references/. No incrustes credenciales ni instrucciones de ampliar permisos.

Incluí casos de selección positivos, negativos y ambiguos en español; reservá otros casos sin usarlos para optimizar. Compará resultado con/sin skill en sesiones y workspaces separados con misma ruta y herramientas.

Borrador, revisión de estructura, prueba conductual y aprobación para un perfil son estados diferentes. Un mock no valida calidad de modelo. No autoaprobar ni activar. Proponé reutilización de una solución pasada solo cuando realmente fue verificada y generaliza.

Las preferencias del usuario y la seguridad del harness prevalecen. Referencia del formato: https://agentskills.io/specification .`,
  },
];
function originalSkills(): SkillRelease[] {
  return definitions.map((d) => {
    const files: Record<string, Buffer> = {
      "SKILL.md": Buffer.from(
        `---\nname: ${d.id}\ndescription: ${JSON.stringify(d.description)}\nlicense: MIT\nmetadata:\n  version: "1.0.0"\n---\n\n${d.body}\n`,
      ),
      LICENSE: Buffer.from(d.notice ?? OWN_LICENSE),
    };
    for (const [name, content] of Object.entries(d.references ?? {}))
      files[name] = Buffer.from(content);
    return releaseFromFiles({
      files,
      provenance: {
        kind: "builtin",
        source:
          d.id === "perfect-dream-loop"
            ? "https://github.com/achimala/dream-loop"
            : "perfect-harness",
        license: "MIT",
        ...(d.id === "perfect-dream-loop"
          ? { commit: "9bddb901f7d071cfefdd21e264267c757177a9df" }
          : {}),
        redistribution: "allowed",
        reviewedBy: "project-maintainers",
        adaptation:
          d.id === "perfect-dream-loop"
            ? "Routing/coste/Judge propios, procedural permitido y target inmutable"
            : "Instrucciones originales de Perfect, no una copia de colecciones comerciales",
      },
      defaultSets: d.sets,
      triggers: d.triggers,
      privacy: "public",
    });
  });
}
export const skillCandidates = [
  {
    id: "superpowers",
    source: "https://github.com/obra/superpowers",
    status: "desactivado",
    reason: "Paquete opcional; ningún hook ni subskill se activa por defecto",
  },
  {
    id: "dashi-motion",
    source: "https://github.com/chuspeeism/dashi-motion",
    status: "pendiente de licencia",
    reason: "No se empaqueta ni traduce contenido sin permiso verificado",
  },
  {
    id: "transitions-dev-free",
    source: "https://github.com/Jakubantalik/transitions.dev",
    status: "importación local",
    reason:
      "Recetas gratuitas con términos propios; colección fuera de Git/instalador. Sin Pro ni Refine LLM",
  },
  {
    id: "matt-pocock",
    source: "https://github.com/mattpocock/skills",
    status: "candidato",
    reason:
      "Seleccionar módulos y verificar licencia/recursos exactos al importar",
  },
  {
    id: "vercel-react",
    source: "https://github.com/vercel-labs/agent-skills",
    status: "candidato",
    reason: "Frontend; no cargar el repositorio entero",
  },
  {
    id: "impeccable",
    source: "https://github.com/pbakaus/impeccable",
    status: "candidato",
    reason:
      "Subordinado al brief; sin importar hooks o ejecutables automáticamente",
  },
  {
    id: "remotion-official",
    source: "https://github.com/remotion-dev/cursor-plugin",
    status: "candidato",
    reason:
      "Verificar distribución MIT y recursos; no modifica licencia del runtime",
  },
  {
    id: "sentry",
    source: "https://github.com/getsentry/skills",
    status: "candidato",
    reason: "Revisión y CI: adaptar herramientas al MCP autorizado",
  },
  {
    id: "openai",
    source: "https://github.com/openai/skills",
    status: "candidato",
    reason: "Procedimientos de CI con permisos y evidencia exacta",
  },
  {
    id: "trail-of-bits",
    source: "https://github.com/trailofbits/skills",
    status: "opcional",
    reason: "Conservar CC-BY-SA y atribuciones del módulo elegido",
  },
  {
    id: "skill-creator",
    source: "https://github.com/anthropics/skills",
    status: "candidato",
    reason:
      "Solo módulos licenciados; las skills documentales no se suponen abiertas",
  },
  {
    id: "addy-osmani",
    source: "https://github.com/addyosmani/agent-skills",
    status: "candidato",
    reason: "Evaluaciones de estructura/selección/comportamiento separadas",
  },
] as const;

export function builtinSkills(): SkillRelease[] {
  return [...originalSkills(), ...curatedSkills()];
}
