/** @jsxImportSource react */
import { useCallback, useSyncExternalStore } from "react";
import { ComposerDrafts } from "./draft-state.js";
const drafts = new ComposerDrafts();
export function useComposerDraft(workspaceId?: string) {
  const value = useSyncExternalStore(drafts.subscribe, () => drafts.read(workspaceId));
  const setValue = useCallback((next: string) => drafts.set(workspaceId, next), [workspaceId]);
  return { value, setValue };
}
export type ComposerDraftHandle = ReturnType<typeof useComposerDraft>;
/** Real editable draft while the core restores state. Sending stays disabled. */
export function StartingWorkspace({ draft }: { draft: ComposerDraftHandle }) {
  return <div className="work-layout"><section className="work-column">
    <div className="intro"><span className="eyebrow">TU PROYECTO, TUS AGENTES</span><h1>¿Qué querés construir?</h1><p>Podés escribir mientras se restaura el motor. No se enviará nada automáticamente.</p></div>
    <section className="activity" aria-live="polite"><div className="welcome-note"><span>◈</span><p>Restaurando el estado del proyecto.<br/><small>Las tareas, los permisos y la actividad aparecerán cuando el motor los confirme.</small></p></div></section>
    <div className="composer">
      <textarea aria-label="¿Qué querés construir?" placeholder="Describí el resultado que querés…" value={draft.value} maxLength={20000} onChange={event => draft.setValue(event.target.value)} />
      <div className="composer-bottom"><small>Borrador local en memoria · sin inferencias</small><button className="primary" disabled>Esperando al motor</button></div>
    </div>
    <small className="composer-hint">Tu texto se conserva al terminar la conexión. Revisalo y pulsá Construir cuando el motor esté listo.</small>
  </section><aside className="agent-rail" aria-label="Estado de conexión"><div className="rail-heading"><span className="eyebrow">CONEXIÓN LOCAL</span></div><div className="rail-note">No se supone que una tarea está terminada ni que no existen objetivos anteriores mientras se restaura el estado.</div></aside></div>;
}
