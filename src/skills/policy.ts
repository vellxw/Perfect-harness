import type { SkillRelease, SkillSelection, StudioConfig, AgentProfile } from "./model.js";

export const normalize = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function matchesTask(skill: SkillRelease, task: string): boolean {
  const haystack = normalize(task);
  return !skill.excludes.some(x => haystack.includes(normalize(x))) && skill.triggers.some(x => haystack.includes(normalize(x)));
}
export function skillAccess(config: StudioConfig, profile: AgentProfile, skill: SkillRelease, selection?: SkillSelection, privacy: string = "private"): { allowed: boolean; reason: string } {
  const deny = (reason: string) => ({ allowed: false, reason });
  if (config.skills.mode === "off") return deny("Sistema desactivado");
  if (!profile.enabled || profile.setIds.some(id => !config.sets.some(s => s.id === id && s.enabled))) return deny("Perfil o equipo desactivado");
  if (config.skills.disabledPackages.includes(skill.packageId)) return deny("Paquete desactivado");
  if (!selection?.enabled) return deny("Versión no habilitada");
  if (selection.releaseId !== skill.id || selection.reviewedHash !== skill.hash) return deny("Versión pendiente de revisión");
  if (skill.provenance.redistribution === "unknown") return deny("Pendiente de licencia");
  if (skill.privacy !== "public" && (privacy === "public" || profile.binding.model.includes("contributor"))) return deny("Privacidad incompatible");
  if (skill.privacy === "confidential" && privacy !== "confidential") return deny("Clasificación insuficiente");
  const relevant = config.skills.assignments.filter(a => a.skillId === skill.skillId && (a.scope === "global" || (a.scope === "set" && profile.setIds.includes(a.target!)) || (a.scope === "profile" && a.target === profile.id)));
  if (relevant.some(a => a.decision === "disable")) return deny("Exclusión explícita");
  if (!relevant.some(a => a.decision === "enable") && !profile.setIds.some(s => skill.defaultSets.includes(s))) return deny("Fuera del equipo");
  if (skill.requiredCapabilities.some(c => !profile.binding.capabilities.includes(c as "text" | "image" | "tools"))) return deny("Capacidad no disponible");
  return { allowed: true, reason: relevant.some(a => a.decision === "enable") ? "Asignación explícita" : "Paquete del equipo" };
}
/** Conservative token estimate, not a provider measurement. */
export const estimateTokens = (value: string): number => Math.ceil(Buffer.byteLength(value, "utf8") / 3);
export const managedSkillPath = (path: string): boolean => /(?:^|\/)(?:\.agents|\.claude|\.pi|\.perfect)\/(?:skills|habilidades)(?:\/|$)/i.test(path.replaceAll("\\", "/")) || /(?:^|\/)skills\.lock\.json$/i.test(path);
