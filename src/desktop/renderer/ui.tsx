/** @jsxImportSource react */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { request } from "./store.js";
export type Page =
  | "work"
  | "agents"
  | "plan"
  | "tasks"
  | "verify"
  | "files"
  | "diff"
  | "artifacts"
  | "skills"
  | "teams"
  | "profiles"
  | "modes"
  | "trials"
  | "integrations"
  | "settings"
  | "validation"
  | "projects"
  | "cost";
export interface Field {
  name: string;
  label: string;
  value?: string;
  type?:
    | "text"
    | "password"
    | "textarea"
    | "number"
    | "select"
    | "file"
    | "directory";
  options?: { value: string; label: string }[];
  required?: boolean;
  help?: string;
  min?: number;
  max?: number;
}
export interface FormSpec {
  title: string;
  description?: string;
  fields: Field[];
  submit: string;
  phrase?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}
export interface UIContextValue {
  navigate: (page: Page) => void;
  notify: (message: string) => void;
  document: (title: string, content: unknown) => void;
  form: (form: FormSpec) => void;
  confirm: (
    title: string,
    detail: string,
    phrase: string,
    action: () => Promise<void>,
  ) => void;
  execute: (
    action: Record<string, unknown>,
    show?: boolean,
  ) => Promise<unknown>;
}
export const UIContext = createContext<UIContextValue | null>(null);
export function useUI() {
  const value = useContext(UIContext);
  if (!value) throw Error("UIContext missing");
  return value;
}
const labels: Record<string, string> = {
  RECEIVED: "Recibido",
  UNDERSTAND: "Entendiendo",
  DISCOVER: "Explorando",
  PLAN: "Planificando",
  DECOMPOSE: "Organizando",
  ASSIGN: "Asignando",
  EXECUTE: "En ejecución",
  VERIFY: "Verificando",
  REVIEW: "En revisión",
  JUDGE: "Evaluando evidencia",
  REPAIR: "Reparando",
  REPLAN: "Replanteando",
  PAUSED: "En pausa",
  DONE: "Completado",
  FAILED: "Fallido",
  ABORTED: "Cancelado",
  running: "En curso",
  completed: "Completado",
  waiting: "En espera",
  blocked: "Bloqueado",
  failed: "Fallido",
  idle: "Disponible",
  passed: "Aprobado",
  accepted: "Aceptado",
  pending: "Pendiente",
  interrupted: "Interrumpido",
  cancelled: "Cancelado",
  authorized: "Autorizado",
  proposed: "Propuesto",
  unknown: "Desconocido",
  planner: "Coordinador",
  general: "General",
  frontend: "Frontend",
  backend: "Backend",
  oracle: "Oracle",
  integrator: "Integración",
  visual: "Revisión visual",
};
export const label = (state: string) => labels[state] ?? state;
export function Status({ value }: { value: string }) {
  const state = value.toLowerCase();
  return (
    <span
      className={`status ${["done", "completed", "accepted", "passed"].includes(state) ? "success" : ["failed", "error"].includes(state) ? "danger" : ["paused", "blocked", "unknown"].includes(state) ? "warning" : ["running", "execute", "verify", "repair", "plan", "review"].includes(state) ? "live" : ""}`}
    >
      <i />
      {label(value)}
    </span>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">PERFECT / ESPACIO DE TRABAJO</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">◇</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Detail({ value }: { value: unknown }) {
  return (
    <pre className="document">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
export function Switch({
  checked,
  label: description,
  onChange,
  disabled,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="switch-control"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={description}
      onClick={onChange}
      disabled={disabled}
    >
      <span className="switch-track">
        <span />
      </span>
      <span>{description}</span>
    </button>
  );
}
export function Row({
  title,
  detail,
  children,
  onOpen,
  status,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
  onOpen?: () => void;
  status?: string;
}) {
  return (
    <article className="item-row">
      <div className="item-main">
        {onOpen ? (
          <button className="text-button item-title" onClick={onOpen}>
            {title}
          </button>
        ) : (
          <strong className="item-title">{title}</strong>
        )}
        {detail && <p>{detail}</p>}
      </div>
      {status && <Status value={status} />}
      <div className="row-actions">{children}</div>
    </article>
  );
}
export function VirtualList<T>({
  items,
  render,
  rowHeight = 78,
  height = 480,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  rowHeight?: number;
  height?: number;
}) {
  const [top, setTop] = useState(0);
  const start = Math.max(0, Math.floor(top / rowHeight) - 3),
    end = Math.min(items.length, start + Math.ceil(height / rowHeight) + 7);
  return (
    <div
      className="virtual-list"
      style={{
        height: Math.min(height, Math.max(rowHeight, items.length * rowHeight)),
      }}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {items.slice(start, end).map((item, i) => (
          <div
            key={start + i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: (start + i) * rowHeight,
              height: rowHeight,
            }}
          >
            {render(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const active = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      if (active instanceof HTMLElement && active.isConnected) active.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Cerrar diálogo"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function FormDialog({
  spec,
  onClose,
}: {
  spec: FormSpec;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(spec.fields.map((f) => [f.name, f.value ?? ""])),
    ),
    [confirmation, setConfirmation] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={spec.title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (spec.phrase && confirmation !== spec.phrase) return;
          setPending(true);
          setError("");
          try {
            await spec.onSubmit(values);
            setValues({});
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se completó");
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="modal-body">
          {spec.description && (
            <p className="explanation">{spec.description}</p>
          )}
          {spec.fields.map((f) => (
            <label className="field" key={f.name}>
              <span>{f.label}</span>
              {f.type === "select" ? (
                <select
                  aria-label={f.label}
                  value={values[f.name] ?? ""}
                  required={f.required}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                >
                  {!f.value && !f.required && (
                    <option value="">Seleccionar</option>
                  )}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  required={f.required}
                  rows={4}
                  value={values[f.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                />
              ) : f.type === "file" || f.type === "directory" ? (
                <div className="file-field">
                  <input
                    aria-label={f.label}
                    readOnly
                    required={f.required}
                    value={values[f.name] ?? ""}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const r = await request("choose-resource", {
                          directory: f.type === "directory",
                        });
                        const p = (r.data as { path?: string })?.path;
                        if (p) setValues((v) => ({ ...v, [f.name]: p }));
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Elegir…
                  </button>
                </div>
              ) : (
                <input
                  aria-label={f.label}
                  type={f.type ?? "text"}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  autoComplete="off"
                  spellCheck={f.type !== "password"}
                  value={values[f.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                />
              )}{" "}
              {f.help && <small>{f.help}</small>}
            </label>
          ))}
          {spec.phrase && (
            <label className="field">
              <span>
                Escribí <strong>{spec.phrase}</strong> para confirmar
              </span>
              <input
                aria-label="Confirmación"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" disabled={pending} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary"
            disabled={
              pending || Boolean(spec.phrase && confirmation !== spec.phrase)
            }
          >
            {pending ? "Procesando…" : spec.submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function jsonResult(raw: unknown): unknown {
  const m = raw as { content?: string; data?: unknown } | undefined;
  if (m?.content) {
    try {
      return JSON.parse(m.content);
    } catch {
      return m.content;
    }
  }
  return m?.data ?? raw;
}
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: label(value) }));
export const widthStyle = (value: number): CSSProperties =>
  ({ "--panel-width": value + "px" }) as CSSProperties;
