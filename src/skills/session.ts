import { hash, id, now, Blocked } from "../domain/util.js";
import type { Goal } from "../domain/model.js";
import type { StateStore } from "../ports/state-store.js";
import type { PerfectConfig } from "../config/schema.js";
import type { SkillRelease, ResolvedProfile } from "./model.js";
import { SkillsRegistry, studioId } from "./registry.js";
import { estimateTokens, skillAccess, matchesTask } from "./policy.js";
import { releaseBytes } from "./importer.js";

export class SkillSession {
  private loaded = new Map<string, SkillRelease>();
  private resources = new Set<string>();
  private spent = 0;
  private readonly registry: SkillsRegistry;
  private readonly initialHash: string;
  constructor(private readonly store: StateStore, private readonly goal: Goal, private readonly base: PerfectConfig, readonly profile: ResolvedProfile, readonly runId: string, private readonly signal: AbortSignal) {
    this.registry = new SkillsRegistry(store);
    this.initialHash = this.registry.get(goal.source, base).hash;
  }
  guard(): void {
    this.signal.throwIfAborted();
    if (this.registry.get(this.goal.source, this.base).hash !== this.initialHash)
      throw new Blocked("SKILL_SESSION_STALE", "Cambiaron equipos, skills o modelo. Reiniciá la sesión desde el checkpoint");
    if (this.loaded.size && !this.registry.masterEnabled()) throw new Blocked("SKILLS_OFF", "Se apagaron las habilidades; reiniciá sin su contexto");
    for (const r of this.loaded.values()) if (!this.allowed(r)) throw new Blocked("SKILL_REVOKED", "La habilidad cargada fue desactivada");
  }
  private allowed(r: SkillRelease): boolean {
    if (!this.registry.masterEnabled()) return false;
    const frozen = this.registry.forGoal(this.goal, this.base);
    const live = this.registry.get(this.goal.source, this.base).config;
    const selection = this.store.get("skillSelections", `${studioId(this.goal.source)}-${r.skillId}`);
    return skillAccess(frozen, this.profile.profile, r, selection, this.goal.privacyClass).allowed && skillAccess(live, this.profile.profile, r, selection, this.goal.privacyClass).allowed;
  }
  private candidates(): SkillRelease[] {
    return this.store.list("skillSelections", studioId(this.goal.source)).flatMap(s => {
      const r = this.store.get("skillReleases", s.releaseId);
      return r && this.allowed(r) ? [r] : [];
    });
  }
  list(): { id: string; description: string; loaded: boolean }[] {
    this.guard();
    const config = this.registry.forGoal(this.goal, this.base);
    if (!this.registry.masterEnabled() || config.skills.mode === "off") return [];
    const result = this.candidates().map(r => ({ id: r.skillId, description: r.description, loaded: this.loaded.has(r.skillId) }));
    if (estimateTokens(JSON.stringify(result)) > config.skills.maxCatalogTokens) throw new Blocked("SKILL_CATALOG_BUDGET", "Reducí el catálogo autorizado para este perfil");
    return result;
  }
  load(skillId: string, reason = "Solicitud explícita"): string {
    this.guard();
    const root = this.candidates().find(r => r.skillId === skillId);
    if (!root) throw new Blocked("SKILL_SCOPE", "Habilidad no autorizada para esta ejecución");
    const config = this.registry.forGoal(this.goal, this.base), requested: SkillRelease[] = [], visiting = new Set<string>();
    const collect = (r: SkillRelease) => {
      if (this.loaded.has(r.skillId) || requested.some(s => s.skillId === r.skillId)) return;
      if (visiting.has(r.skillId)) throw new Blocked("SKILL_DEPENDENCY_CYCLE", r.skillId);
      visiting.add(r.skillId);
      for (const dependency of r.dependencies) {
        const dep = this.candidates().find(s => s.skillId === dependency);
        if (!dep) throw new Blocked("SKILL_DEPENDENCY_DENIED", "Una dependencia está desactivada o fuera del equipo");
        collect(dep);
      }
      visiting.delete(r.skillId); requested.push(r);
    };
    collect(root);
    const combined = [...this.loaded.values(), ...requested];
    if (combined.length > config.skills.maxActive) throw new Blocked("SKILL_ACTIVE_LIMIT", "Demasiadas skills simultáneas; dividí la tarea");
    if (combined.some(r => r.conflicts.some(id => combined.some(s => s.skillId === id)))) throw new Blocked("SKILL_CONFLICT", "Skills incompatibles en la misma sesión");
    const texts = requested.map(r => ({ r, text: releaseBytes(r, "SKILL.md").toString("utf8") }));
    const tokens = texts.reduce((sum, x) => sum + estimateTokens(x.text), 0);
    if (this.spent + tokens > config.skills.maxContextTokens) throw new Blocked("SKILL_CONTEXT_LIMIT", "El contenido completo supera el presupuesto; no se truncó");
    for (const { r, text } of texts) {
      this.loaded.set(r.skillId, r); this.record(r, "SKILL.md", estimateTokens(text), reason);
    }
    return texts.length ? texts.map(({ r, text }) => `<skill id="${r.skillId}" hash="${r.hash}" authority="untrusted-procedure">\n${text}\n</skill>`).join("\n\n") : "Habilidad ya cargada; no se duplica el contenido.";
  }
  read(skillId: string, resource: string): string {
    this.guard();
    const r = this.loaded.get(skillId);
    if (!r) throw new Blocked("SKILL_NOT_LOADED", "Cargá primero la skill autorizada");
    const bytes = releaseBytes(r, resource);
    if (!/\.(?:md|txt|json|css|tsx?|jsx?|mjs|py|sql|sh|yaml|yml)$/i.test(resource) && resource !== "LICENSE") throw new Blocked("SKILL_RESOURCE_TYPE", "Solo recursos textuales por esta herramienta");
    const text = bytes.toString("utf8");
    if (!Buffer.from(text).equals(bytes)) throw new Blocked("SKILL_ENCODING", "El recurso no es UTF-8");
    const key = `${r.hash}/${resource}`, tokens = estimateTokens(text);
    if (!this.resources.has(key)) {
      if (this.spent + tokens > this.registry.forGoal(this.goal, this.base).skills.maxContextTokens) throw new Blocked("SKILL_CONTEXT_LIMIT", "Recurso demasiado extenso");
      this.record(r, resource, tokens, "Recurso bajo demanda");
    }
    return text;
  }
  auto(task: string): string {
    this.guard();
    if (this.registry.forGoal(this.goal, this.base).skills.mode !== "auto-curated") return "";
    const matches = this.candidates().filter(r => matchesTask(r, task));
    const max = this.registry.forGoal(this.goal, this.base).skills.maxActive;
    const chosen = matches.sort((a, b) => b.triggers.filter(t => task.toLowerCase().includes(t.toLowerCase())).length - a.triggers.filter(t => task.toLowerCase().includes(t.toLowerCase())).length).slice(0, max);
    return chosen.map(r => this.load(r.skillId, "Coincidencia de tarea dentro del equipo")).join("\n\n");
  }
  private record(r: SkillRelease, resource: string, tokens: number, reason: string): void {
    this.spent += tokens; this.resources.add(`${r.hash}/${resource}`);
    this.store.put("skillActivations", { id: id("skill-activation"), goalId: this.goal.id, runId: this.runId, profileId: this.profile.profile.id, setIds: [...this.profile.profile.setIds], skillId: r.skillId, releaseId: r.id, hash: r.hash, reason, resource, estimatedTokens: tokens, createdAt: now() }, "skill.loaded");
  }
  summary() { return { ids: [...this.loaded.keys()], estimatedTokens: this.spent, hash: hash([...this.loaded.values()].map(r => r.hash)) }; }
}
