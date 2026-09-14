import type { PerfectConfig } from "../config/schema.js";
import { RoleSchema, type AgentDefinition, type Role } from "../domain/model.js";
import { Blocked } from "../domain/util.js";
import { StudioConfigSchema, type AgentProfile, type StudioConfig, type ResolvedProfile, type WorkMode } from "../skills/model.js";

export function defaultStudio(config: PerfectConfig): StudioConfig {
  const setFor: Record<Role, string> = { planner: "general", general: "general", integrator: "general", frontend: "frontend-web", backend: "backend", visual: "review", oracle: "review" };
  const profiles: AgentProfile[] = RoleSchema.options.map(role => {
    const { id: _id, readOnly, ...binding } = config.agents[role];
    return { id: role, name: role, role, enabled: true, setIds: [setFor[role]], readOnly, binding: { ...binding, capabilities: [...binding.capabilities] } };
  });
  const add = (id: string, name: string, role: Role, sets: string[]) => {
    const base = profiles.find(p => p.id === role)!;
    profiles.push({ ...structuredClone(base), id, name, setIds: sets });
  };
  add("backend-qa", "Pruebas de backend", "general", ["backend"]);
  add("motion-remotion", "Motion con Remotion", "frontend", ["motion"]);
  add("motion-ae", "After Effects", "general", ["motion"]);
  add("motion-rive", "Rive", "frontend", ["motion"]);
  add("motion-cavalry", "Cavalry", "general", ["motion"]);
  add("gameplay", "Programación de juego", "general", ["gameplay"]);
  add("game-ui", "Interfaz del juego", "frontend", ["frontend-web", "gameplay"]);
  add("game-assets", "Assets 3D", "general", ["assets-3d"]);
  add("game-qa", "Playtesting", "general", ["game-qa"]);
  add("game-critic", "Crítica visual del juego", "visual", ["review", "assets-3d"]);
  add("skill-author", "Creador de habilidades", "general", ["general"]);
  const defaults = Object.fromEntries(RoleSchema.options.map(r => [r, r])) as Record<Role, string>;
  const basic = Object.values(defaults);
  const modes: WorkMode[] = [
    { id: "applications", name: "Aplicaciones", enabled: true, profiles: [...basic, "backend-qa"], defaults, engine: "project", instruction: "Respetá el stack existente. Para una aplicación NUEVA que necesita persistencia, construí un servicio propio con PostgreSQL directo; nunca un backend como servicio. No agregues servidor a contenido estático u offline. Un servicio modular mínimo; colas, caché distribuida y microservicios solo con necesidad demostrada." },
    { id: "motion-studio", name: "Motion Studio", enabled: true, profiles: [...basic, "motion-remotion", "motion-ae", "motion-rive", "motion-cavalry"], defaults: { ...defaults, frontend: "motion-remotion" }, engine: "project", instruction: "Identificá el editor elegido por el usuario y su entrega editable. No reemplaces AE/Rive/Cavalry por Remotion. Confirmá que existe acceso real antes de planear operaciones nativas. Generar archivo, abrir/guardar, reproducir y renderizar son evidencias diferentes. Conservá partes aprobadas y verificá continuidad temporal, no solo un frame." },
    { id: "game-creator", name: "Game Creator", enabled: true, profiles: [...basic, "gameplay", "game-ui", "game-assets", "game-qa", "game-critic"], defaults: { ...defaults, general: "gameplay", frontend: "game-ui", visual: "game-critic" }, engine: "project", instruction: "Primero una porción pequeña jugable: controles, interacción principal, objetivo, éxito/fallo y reinicio. Respetá el motor elegido o existente. Web 2D: evaluar Phaser; web 3D: Three.js/R3F según contexto. Unity/Godot no se migran automáticamente. Assets, GUI, pruebas y crítica son perfiles separados. No agregar multijugador/backend/nube sin requisito. DONE exige pruebas de jugabilidad además de capturas y rendimiento del entorno real." },
    { id: "skill-studio", name: "Estudio de habilidades", enabled: true, profiles: [...basic, "skill-author"], defaults: { ...defaults, general: "skill-author" }, engine: "project", instruction: "Producí un borrador SKILL.md especializado en un equipo, con activadores, exclusiones, entradas/salidas, referencias y casos positivos/negativos. No concedas herramientas ni alteres políticas. Validá estructura; separá casos de desarrollo y reservados. No afirmes mejora conductual sin comparaciones reales con y sin skill. No te autoapruebes: el usuario importa/revisa el borrador aparte." },
  ];
  return StudioConfigSchema.parse({ schemaVersion: 1, skills: { mode: "auto-curated", maxActive: 3, maxContextTokens: 6000, maxCatalogTokens: 1200, disabledPackages: ["superpowers"], assignments: [] }, sets: [
    ["frontend-web", "Frontend web"], ["backend", "Backend PostgreSQL"], ["motion", "Motion"], ["gameplay", "Gameplay"], ["assets-3d", "Assets 3D"], ["game-qa", "QA de juegos"], ["review", "Revisión"], ["general", "General"],
  ].map(([id, name]) => ({ id, name, enabled: true })), profiles, modes, activeMode: "applications", preferences: { database: "postgresql", backendAsService: false, simplicity: "minimal-sufficient" } });
}
export function resolveProfile(config: StudioConfig, role: Role, profileId?: string): ResolvedProfile {
  const mode = config.modes.find(m => m.id === config.activeMode && m.enabled);
  if (!mode) throw new Blocked("MODE_DISABLED", "Modo no disponible");
  const wanted = profileId ?? mode.defaults[role];
  const profile = config.profiles.find(p => p.id === wanted && p.enabled);
  if (!profile || profile.role !== role || !mode.profiles.includes(wanted))
    throw new Blocked("PROFILE_SCOPE", `Perfil no autorizado para ${role}: ${wanted}`);
  const sets = profile.setIds.map(id => config.sets.find(s => s.id === id));
  if (sets.some(s => !s || !s.enabled)) throw new Blocked("SET_DISABLED", "El equipo está desactivado");
  return { profile, mode, sets: sets.filter((s): s is NonNullable<typeof s> => Boolean(s)), role };
}
export function profileDefinition(value: ResolvedProfile): AgentDefinition {
  return { ...value.profile.binding, id: value.role, readOnly: value.profile.readOnly };
}
