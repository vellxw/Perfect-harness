export interface ComposerDraft { value: string; updatedAt: number }
/** Drafts are presentation-only, memory-only and scoped to an authorized workspace.
 * They never imply a submitted goal, a permission, or an active engine. */
export class ComposerDrafts {
  private entries = new Map<string, ComposerDraft>();
  private listeners = new Set<() => void>();
  constructor(private readonly limit = 12, private readonly maxCharacters = 20000) {}
  read(workspaceId?: string): string { return workspaceId ? this.entries.get(workspaceId)?.value ?? "" : ""; }
  set(workspaceId: string | undefined, value: string): void {
    if (!workspaceId || !/^[A-Za-z0-9:_-]{1,200}$/.test(workspaceId)) throw new Error("No hay una carpeta autorizada para el borrador");
    if (value.length > this.maxCharacters) throw new Error("El borrador supera el límite de caracteres");
    if (value === this.read(workspaceId)) return;
    this.entries.delete(workspaceId);
    if (value) this.entries.set(workspaceId, { value, updatedAt: Date.now() });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    for (const notify of this.listeners) notify();
  }
  subscribe = (notify: () => void): (() => void) => { this.listeners.add(notify); return () => this.listeners.delete(notify); };
  clear(): void { this.entries.clear(); for (const notify of this.listeners) notify(); }
}
