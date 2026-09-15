/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { connect, useDesktop, request } from "./store.js";
import type { UiSnapshot, UiMessage } from "../contracts/protocol.js";
import {
  UIContext,
  Modal,
  FormDialog,
  Detail,
  Status,
  Empty,
  label,
  jsonResult,
  type Page,
  type FormSpec,
} from "./ui.js";
import {
  Agents,
  Plan,
  Tasks,
  Verify,
  Files,
  Diff,
  Costs,
  Projects,
} from "./work.js";
import { Skills, Teams, Profiles, Modes } from "./studio.js";
import { Trials } from "./trials.js";
import { Integrations, Validation, Settings } from "./integrations.js";
import { Artifacts } from "./media.js";
import "./theme.css";
const pages: { id: Page; name: string; group: string }[] = [
  { id: "work", name: "Trabajo", group: "Objetivo" },
  { id: "agents", name: "Agentes", group: "Objetivo" },
  { id: "plan", name: "Plan", group: "Objetivo" },
  { id: "tasks", name: "Tareas", group: "Objetivo" },
  { id: "verify", name: "Verificación", group: "Objetivo" },
  { id: "diff", name: "Cambios", group: "Resultados" },
  { id: "files", name: "Archivos", group: "Resultados" },
  { id: "artifacts", name: "Resultados", group: "Resultados" },
  { id: "skills", name: "Habilidades", group: "Configuración" },
  { id: "teams", name: "Equipos", group: "Configuración" },
  { id: "profiles", name: "Perfiles y modelos", group: "Configuración" },
  { id: "modes", name: "Modos de trabajo", group: "Configuración" },
  { id: "trials", name: "Estudio de habilidades", group: "Configuración" },
  { id: "integrations", name: "Integraciones", group: "Configuración" },
  { id: "validation", name: "Validación local", group: "Sistema" },
  { id: "cost", name: "Consumo", group: "Sistema" },
  { id: "settings", name: "Ajustes", group: "Sistema" },
  { id: "projects", name: "Proyecto e historial", group: "Sistema" },
];
function App() {
  const state = useDesktop(),
    s = state.snapshot,
    [page, setPage] = useState<Page>("work"),
    [form, setForm] = useState<FormSpec>(),
    [documentView, setDocument] = useState<{
      title: string;
      content: unknown;
    }>(),
    [palette, setPalette] = useState(false),
    [query, setQuery] = useState(""),
    [notification, setNotification] = useState(""),
    [auth, setAuth] = useState<Extract<UiMessage, { type: "auth" }>>(),
    [previewHidden, setPreviewHidden] = useState(false);
  const consumed = useRef(new WeakSet<object>()),
    initialized = useRef(""),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (message: string) => {
    setNotification(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotification(""), 6500);
  };
  const execute = async (action: Record<string, unknown>, show = false) => {
    try {
      const response = await request("action", action);
      const result = response.data as
        | { message?: string; content?: string; ok?: boolean }
        | undefined;
      if (result?.message) notify(result.message);
      if (show && result?.content)
        setDocument({
          title: "Detalle de la operación",
          content: jsonResult(result),
        });
      return result;
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se completó la operación",
      );
      throw error;
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    setPalette(false);
    setQuery("");
    setDocument(undefined);
  };
  const confirm = (
    title: string,
    description: string,
    phrase: string,
    onSubmit: () => Promise<void>,
  ) =>
    setForm({
      title,
      description,
      phrase,
      submit: "Confirmar",
      fields: [],
      onSubmit: async () => onSubmit(),
    });
  useEffect(() => {
    void connect();
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (s && state.connected && initialized.current !== s.workspace) {
      initialized.current = s.workspace;
      void execute({ type: "studio", action: { command: "status" } }).catch(
        () => {},
      );
      void execute({
        type: "integration",
        action: { command: "refresh" },
      }).catch(() => {});
    }
  }, [s?.workspace, state.connected]);
  useEffect(() => {
    for (const message of state.messages) {
      if (consumed.current.has(message)) continue;
      consumed.current.add(message);
      if (message.type === "auth") {
        if (message.done) {
          setAuth(undefined);
          notify(message.message);
        } else setAuth(message);
      } else if (message.type === "fault") notify(message.message);
      else if (message.type === "result" && !message.ok)
        notify(message.message);
    }
  }, [state.messages]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        navigate("projects");
      }
    };
    const rejection = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      notify(
        e.reason instanceof Error
          ? e.reason.message
          : "Operación no completada",
      );
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("unhandledrejection", rejection);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("unhandledrejection", rejection);
    };
  }, []);
  const modalOpen = Boolean(form || documentView || palette || auth);
  useEffect(() => {
    if (state.preview) {
      void request("preview-layout", {
        x: 20,
        y: 180,
        width: Math.max(300, window.innerWidth - 40),
        height: Math.max(200, window.innerHeight - 220),
        visible: !modalOpen && !previewHidden,
      }).catch(() => {});
    }
  }, [state.preview, modalOpen, previewHidden]);
  useEffect(() => {
    if (!state.preview) return;
    const resize = () =>
      void request("preview-layout", {
        x: 20,
        y: 180,
        width: Math.max(300, window.innerWidth - 40),
        height: Math.max(200, window.innerHeight - 220),
        visible: !modalOpen && !previewHidden,
      }).catch(() => {});
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [state.preview, modalOpen, previewHidden]);
  const context = useMemo(
    () => ({
      navigate,
      notify,
      document: (title: string, content: unknown) =>
        setDocument({ title, content }),
      form: setForm,
      confirm,
      execute,
    }),
    [s?.workspace, state.boot?.workspaceId],
  );
  const motion = s?.preferences.ui.motion ?? "auto",
    contrast = s?.preferences.ui.contrast ?? "normal";
  let content: ReactNode = (
    <Empty title="Conectando al motor local…">
      No se iniciará trabajo antes de confirmar la conexión.
    </Empty>
  );
  if (s) {
    switch (page) {
      case "work":
        content = (
          <Work
            s={s}
            connected={state.connected}
            execute={execute}
            navigate={navigate}
            confirm={confirm}
            notify={notify}
          />
        );
        break;
      case "agents":
        content = <Agents s={s} />;
        break;
      case "plan":
        content = <Plan s={s} />;
        break;
      case "tasks":
        content = <Tasks s={s} />;
        break;
      case "verify":
        content = <Verify s={s} />;
        break;
      case "files":
        content = <Files s={s} />;
        break;
      case "diff":
        content = <Diff s={s} />;
        break;
      case "artifacts":
        content = <Artifacts s={s} />;
        break;
      case "skills":
        content = <Skills s={s} />;
        break;
      case "teams":
        content = <Teams s={s} />;
        break;
      case "profiles":
        content = <Profiles s={s} />;
        break;
      case "modes":
        content = <Modes s={s} />;
        break;
      case "trials":
        content = <Trials s={s} />;
        break;
      case "integrations":
        content = <Integrations s={s} />;
        break;
      case "validation":
        content = <Validation s={s} />;
        break;
      case "cost":
        content = <Costs s={s} />;
        break;
      case "settings":
        content = <Settings s={s} />;
        break;
      case "projects":
        content = <Projects s={s} />;
    }
  }
  return (
    <UIContext.Provider value={context}>
      <div
        className={`shell ${page === "work" ? "work-shell" : ""}`}
        data-motion={motion}
        data-contrast={contrast}
        data-transparent={s?.preferences.ui.transparent !== false}
      >
        <header>
          <button
            className="brand"
            onClick={() => navigate("work")}
            aria-label="Inicio de Perfect"
          >
            <img src="assets/perfect-symbol.svg" alt="" />
            <strong>Perfect</strong>
          </button>
          <button
            className="workspace-selector"
            onClick={() => navigate("projects")}
          >
            {s?.workspaceName ?? "Carpeta de trabajo"} <span>⌄</span>
          </button>
          <div className="header-status">
            <span className="connection">
              <i className={state.connected ? "online" : "waiting"} />
              {state.connected ? "Motor conectado" : "Conectando…"}
            </span>
            {s?.goal && <Status value={s.goal.state} />}
          </div>
          <button
            className="command-button"
            onClick={() => setPalette(true)}
            aria-label="Abrir comandos y navegación"
          >
            Explorar <kbd>Ctrl K</kbd>
          </button>
        </header>
        <nav className="top-navigation" aria-label="Secciones principales">
          {pages
            .filter((p) =>
              [
                "work",
                "agents",
                "plan",
                "verify",
                "diff",
                "artifacts",
                "skills",
                "profiles",
                "integrations",
              ].includes(p.id),
            )
            .map((p) => (
              <button
                key={p.id}
                aria-current={page === p.id ? "page" : undefined}
                onClick={() => navigate(p.id)}
              >
                {p.name}
              </button>
            ))}
          <button aria-label="Más secciones" onClick={() => setPalette(true)}>
            •••
          </button>
        </nav>
        {!state.connected && (
          <div className="connection-banner" role="status">
            {state.error ?? "Preparando conexión segura con el motor…"}
            {state.error && (
              <button
                onClick={() =>
                  void request("restart-engine")
                    .then(() => connect())
                    .catch((e) => notify(String(e)))
                }
              >
                Recuperar motor
              </button>
            )}
          </div>
        )}
        <main className={page === "work" ? "work-main" : "page-main"}>
          {content}
        </main>
        {state.preview && (
          <div className="preview-header">
            <strong>Preview manual aislado</strong>
            <span>Sesión independiente de las pruebas</span>
            <button onClick={() => setPreviewHidden((v) => !v)}>
              {previewHidden ? "Mostrar" : "Ocultar"}
            </button>
            <button
              onClick={() =>
                void request("preview-stop").catch((e) => notify(String(e)))
              }
            >
              Cerrar preview
            </button>
          </div>
        )}
        <footer className="app-footer">
          <span>
            Perfect Desktop {state.boot?.version ?? "…"} ·{" "}
            {s?.goal?.privacy === "public"
              ? "Proyecto público"
              : "Privado por defecto"}{" "}
            {s?.demo ? "· DEMO / datos sintéticos" : ""}
          </span>
          <div>
            <button onClick={() => navigate("cost")}>Consumo</button>
            <button onClick={() => navigate("validation")}>
              Validación local
            </button>
            <button onClick={() => navigate("settings")}>Ajustes</button>
          </div>
        </footer>
        {notification && (
          <div className="toast" role="status">
            <span>{notification}</span>
            <button
              aria-label="Cerrar aviso"
              onClick={() => setNotification("")}
            >
              ×
            </button>
          </div>
        )}
        {form && (
          <FormDialog
            key={form.title}
            spec={form}
            onClose={() => setForm(undefined)}
          />
        )}{" "}
        {documentView && (
          <Modal
            title={documentView.title}
            wide
            onClose={() => setDocument(undefined)}
          >
            <div className="modal-body">
              <Detail value={documentView.content} />
            </div>
            <div className="modal-footer">
              <button
                onClick={() =>
                  void request("copy", {
                    text:
                      typeof documentView.content === "string"
                        ? documentView.content
                        : JSON.stringify(documentView.content, null, 2),
                  })
                }
              >
                Copiar
              </button>
              <button onClick={() => setDocument(undefined)}>Cerrar</button>
            </div>
          </Modal>
        )}
        {palette && (
          <Modal title="¿Adónde querés ir?" onClose={() => setPalette(false)}>
            <div className="modal-body">
              <input
                className="search"
                autoFocus
                aria-label="Buscar sección"
                placeholder="Buscar herramientas, habilidades, ajustes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="palette-list">
                {pages
                  .filter((p) =>
                    `${p.name} ${p.group}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      aria-label={p.name}
                      onClick={() => navigate(p.id)}
                    >
                      <span>{p.name}</span>
                      <small>{p.group}</small>
                    </button>
                  ))}
              </div>
            </div>
          </Modal>
        )}
        {auth && (
          <AuthDialog
            message={auth}
            execute={execute}
            onClose={() => {
              void execute({ type: "auth-cancel" }).catch(() => {});
              setAuth(undefined);
            }}
          />
        )}
      </div>
    </UIContext.Provider>
  );
}
function Work({
  s,
  connected,
  execute,
  navigate,
  confirm,
  notify,
}: {
  s: UiSnapshot;
  connected: boolean;
  execute: (
    action: Record<string, unknown>,
    show?: boolean,
  ) => Promise<unknown>;
  navigate: (page: Page) => void;
  confirm: (
    title: string,
    description: string,
    phrase: string,
    action: () => Promise<void>,
  ) => void;
  notify: (message: string) => void;
}) {
  const [value, setValue] = useState(""),
    [pending, setPending] = useState(false),
    [isPublic, setPublic] = useState(false),
    [attachments, setAttachments] = useState<string[]>([]),
    [drag, setDrag] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setValue("");
    setAttachments([]);
    setPublic(false);
  }, [s.workspace]);
  const start = async () => {
    if (!value.trim()) return;
    setPending(true);
    try {
      if (attachments.length)
        throw Error(
          "Los recursos fueron seleccionados pero no importados. Revisá la importación antes de enviarlos al agente.",
        );
      await execute({ type: "goal", description: value, public: isPublic });
      setValue("");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="work-layout">
      <section className="work-column">
        {!s.goal ? (
          <div className="intro">
            <span className="eyebrow">TU PROYECTO, TUS AGENTES</span>
            <h1>¿Qué querés construir?</h1>
            <p>Elegí una carpeta y describí el resultado que buscás.</p>
            <div className="mode-shortcuts">
              <button onClick={() => navigate("modes")}>
                {s.studio?.config.modes.find(
                  (m) => m.id === s.studio!.config.activeMode,
                )?.name ?? "Aplicaciones"}{" "}
                <span>⌄</span>
              </button>
              <button onClick={() => navigate("skills")}>
                Elegir habilidades
              </button>
              <button onClick={() => navigate("profiles")}>
                Modelos del equipo
              </button>
            </div>
          </div>
        ) : (
          <section className="goal">
            <div className="goal-top">
              <span className="eyebrow">OBJETIVO ACTUAL</span>
              <span className="revision">{s.goal.revision.slice(0, 10)}</span>
            </div>
            <h1>{s.goal.request}</h1>
            <div className="goal-meta">
              <Status value={s.goal.state} />
              <span>
                Iteración {s.goal.iteration}/{s.goal.maxIterations}
              </span>
              <span>
                Verificación {s.verification.passed}/{s.verification.total}
              </span>
            </div>
            {s.goal.reason && (
              <p
                className={
                  s.goal.state === "DONE" ? "completion-note" : "blocking-note"
                }
              >
                {s.goal.reason}
              </p>
            )}
            <div className="goal-controls">
              {s.busy ? (
                <button
                  onClick={() =>
                    void execute({ type: "pause", goalId: s.goal!.id })
                  }
                >
                  Pausar
                </button>
              ) : s.goal.state === "PAUSED" ? (
                <button
                  className="primary"
                  onClick={() =>
                    void execute({ type: "resume", goalId: s.goal!.id })
                  }
                >
                  Reanudar
                </button>
              ) : null}
              <button onClick={() => navigate("plan")}>Revisar plan</button>
              <button onClick={() => navigate("diff")}>Ver cambios</button>
              {!["DONE", "FAILED", "ABORTED"].includes(s.goal.state) && (
                <button
                  onClick={() =>
                    confirm(
                      "Cancelar objetivo",
                      "Se conservarán checkpoints, archivos y evidencia. Las sesiones y herramientas se detienen antes de liberar sus recursos.",
                      "CANCELAR",
                      async () => {
                        await execute({
                          type: "abort",
                          goalId: s.goal!.id,
                          confirmation: "ABORT",
                        });
                      },
                    )
                  }
                >
                  Cancelar objetivo
                </button>
              )}
              {s.goal.state === "PAUSED" && (
                <button
                  onClick={() =>
                    confirm(
                      "Preparar dependencias",
                      "Descarga paquetes aprobados para una imagen aislada. No ejecuta instaladores del proyecto ni habilita acceso de red durante las pruebas.",
                      "PREPARAR",
                      async () => {
                        await execute({
                          type: "prepare",
                          goalId: s.goal!.id,
                          confirmation: "PREPARAR",
                          allowNetwork: true,
                        });
                      },
                    )
                  }
                >
                  Preparar entorno
                </button>
              )}
            </div>
          </section>
        )}
        <section className="activity" aria-label="Actividad del objetivo">
          {s.activity.length ? (
            s.activity.slice(-60).map((item) => (
              <article key={item.id} className={`activity-item ${item.status}`}>
                <span className="activity-icon">
                  {item.status === "completed"
                    ? "✓"
                    : item.status === "failed" || item.status === "blocked"
                      ? "!"
                      : item.status === "running"
                        ? "◌"
                        : "·"}
                </span>
                <div>
                  <div className="activity-title">
                    <strong>{item.title}</strong>
                    <time>
                      {item.time
                        ? new Date(item.time).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </time>
                  </div>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))
          ) : s.goal ? (
            <Empty title="Esperando actividad verificable">
              Los eventos aparecen cuando el motor confirma una acción.
            </Empty>
          ) : (
            <div className="welcome-note">
              <span>◈</span>
              <p>
                Planificación, implementación y pruebas en un mismo lugar.
                <br />
                <small>Vos elegís las herramientas y los permisos.</small>
              </p>
            </div>
          )}
        </section>
        <div
          className={`composer ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDrag(false);
            try {
              const paths = await window.perfect.droppedFiles(
                Array.from(e.dataTransfer.files),
              );
              setAttachments((a) => [...new Set([...a, ...paths])]);
            } catch (error) {
              notify(String(error));
            }
          }}
        >
          <textarea
            ref={field}
            aria-label="¿Qué querés construir?"
            placeholder={
              s.busy
                ? "Pausá el objetivo antes de iniciar otro"
                : "Describí el resultado que querés…"
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (!s.busy && !pending) void start();
              }
            }}
          />
          {attachments.length > 0 && (
            <div className="attachment-chips">
              {attachments.map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    setAttachments((a) => a.filter((x) => x !== p))
                  }
                >
                  {p.split(/[\\/]/).at(-1)} ×
                </button>
              ))}
            </div>
          )}
          <div className="composer-bottom">
            <div className="composer-options">
              <button
                className="icon-button"
                title="Seleccionar referencia local"
                aria-label="Adjuntar referencia"
                onClick={async () => {
                  try {
                    const r = await request("choose-resource", {
                      directory: false,
                    });
                    const path = (r.data as { path?: string })?.path;
                    if (path) setAttachments((a) => [...a, path]);
                  } catch (error) {
                    notify(String(error));
                  }
                }}
              >
                ＋
              </button>
              <select
                aria-label="Privacidad del nuevo objetivo"
                value={String(isPublic)}
                onChange={(e) => setPublic(e.target.value === "true")}
              >
                <option value="false">Privado</option>
                <option value="true">Público</option>
              </select>
              <button onClick={() => navigate("modes")}>
                {s.studio?.config.activeMode ?? "applications"} ⌄
              </button>
            </div>
            <button
              className="primary"
              disabled={!connected || !value.trim() || pending || s.busy}
              onClick={() => void start()}
            >
              {pending ? "Enviando…" : "Construir ↗"}
            </button>
          </div>
        </div>
        <small className="composer-hint">
          Ctrl + Enter para enviar · No se publica ni se aplica código sin
          autorización
        </small>
      </section>
      <aside className="agent-rail" aria-label="Agentes del equipo">
        <div className="rail-heading">
          <span className="eyebrow">TU EQUIPO</span>
          <button className="text-button" onClick={() => navigate("profiles")}>
            Configurar
          </button>
        </div>
        {s.agents.slice(0, 8).map((a) => (
          <button
            key={a.id}
            className="agent-summary"
            onClick={() => navigate("agents")}
          >
            <span
              className={`agent-orb ${a.status === "running" ? "active" : ""}`}
            >
              {label(a.role).slice(0, 1)}
            </span>
            <div>
              <strong>{label(a.role)}</strong>
              <small>{a.model}</small>
              <Status value={a.status} />
            </div>
          </button>
        ))}
        <div className="rail-note">
          Los perfiles pueden compartir un modelo sin compartir sus habilidades.
        </div>
        <button
          className="subtle-button"
          onClick={() => navigate("integrations")}
        >
          Integraciones y permisos →
        </button>
      </aside>
    </div>
  );
}
function AuthDialog({
  message,
  execute,
  onClose,
}: {
  message: Extract<UiMessage, { type: "auth" }>;
  execute: (action: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setValue("");
    setPending(false);
    setError("");
  }, [message.promptId]);
  return (
    <Modal title={"Conectar · " + message.provider} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!message.promptId) return;
          setPending(true);
          try {
            await execute({
              type: "auth-answer",
              promptId: message.promptId,
              value,
            });
            setValue("");
          } catch (error) {
            setError(String(error));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="modal-body">
          <p>{message.message}</p>
          {message.url && (
            <button
              type="button"
              onClick={() =>
                void request("external-auth", { url: message.url })
              }
            >
              Continuar en el navegador
            </button>
          )}
          {message.code && <p className="auth-code">{message.code}</p>}
          {message.promptId && (
            <label className="field">
              <span>
                {message.secret ? "Credencial local" : "Respuesta solicitada"}
              </span>
              {message.options ? (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {message.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={message.secret ? "password" : "text"}
                  autoComplete="off"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </label>
          )}
          <p className="muted">
            Las credenciales se procesan localmente. No se guardan en el
            historial de la interfaz.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancelar conexión
          </button>
          {message.promptId && (
            <button
              className="primary"
              disabled={!value || pending}
              type="submit"
            >
              Continuar
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
