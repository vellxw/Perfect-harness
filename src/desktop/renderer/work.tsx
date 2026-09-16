/** @jsxImportSource react */
import { useEffect, useState } from "react";
import type { UiSnapshot } from "../contracts/protocol.js";
import { request } from "./store.js";
import {
  useUI,
  Heading,
  Empty,
  Status,
  Row,
  VirtualList,
  label,
  jsonResult,
} from "./ui.js";
export function Agents({ s }: { s: UiSnapshot }) {
  const ui = useUI();
  return (
    <>
      <Heading
        title="Agentes"
        description="Cada ejecución conserva su modelo, cuenta y nivel de razonamiento reales."
      />
      {!s.agents.length ? (
        <Empty title="Aún no hay ejecuciones">
          Los perfiles se eligen en Perfiles y modelos.
        </Empty>
      ) : (
        s.agents.map((a) => (
          <Row
            key={a.id}
            title={`${label(a.role)} · ${a.model}`}
            detail={`${a.provider} · ${a.account} · ${a.selected} · ${a.requests} solicitudes`}
            status={a.status}
            onOpen={() => ui.document("Ruta de ejecución", a)}
          >
            <button onClick={() => ui.document("Metadatos observados", a)}>
              Detalles
            </button>
          </Row>
        ))
      )}
    </>
  );
}
export function Plan({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    p = s.plan;
  return (
    <>
      <Heading
        title="Plan de trabajo"
        description="Los criterios aprobados no se debilitan para conseguir un resultado verde."
      />
      {!p ? (
        <Empty title="El plan aparecerá aquí">Primero creá un objetivo.</Empty>
      ) : (
        <>
          <section className="reading">
            <h3>{p.summary}</h3>
            {p.architecture.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <h4>Criterios de aceptación</h4>
            {p.criteria.map((c) => (
              <div className="criterion" key={c.id}>
                <span>○</span>
                <div>
                  <strong>{c.description}</strong>
                  <small>
                    {c.kind} · {c.id}
                  </small>
                </div>
              </div>
            ))}
            {p.risks.length > 0 && (
              <>
                <h4>Riesgos considerados</h4>
                {p.risks.map((r, i) => (
                  <p key={i}>{r}</p>
                ))}
              </>
            )}
            <code>
              Versión {p.version} · {p.hash}
            </code>
          </section>
          <div className="sticky-actions">
            {p.approved ? (
              <Status value="accepted" />
            ) : (
              <button
                className="primary"
                onClick={() =>
                  ui.confirm(
                    "Aprobar el plan",
                    `Se autoriza esta versión exacta de los criterios y la estrategia de verificación.\n${p.hash}`,
                    "APROBAR",
                    async () => {
                      await ui.execute({
                        type: "approve",
                        goalId: s.goal!.id,
                        planHash: p.hash,
                      });
                    },
                  )
                }
              >
                Aprobar plan
              </button>
            )}
            <button onClick={() => ui.navigate("tasks")}>Ver tareas</button>
          </div>
        </>
      )}
    </>
  );
}
export function Tasks({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    [filter, setFilter] = useState("");
  const items = s.tasks.filter((t) =>
    `${t.title} ${t.role} ${t.status}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <>
      <Heading
        title="Tareas"
        description="Dependencias, intentos y superficies de escritura asignadas a cada agente."
      />
      <input
        className="search"
        aria-label="Buscar tarea"
        placeholder="Buscar por nombre, agente o estado"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {!items.length ? (
        <Empty title="No hay tareas para mostrar" />
      ) : (
        <VirtualList
          items={items}
          height={540}
          render={(t) => (
            <Row
              title={t.title}
              detail={`${label(t.role)} · intento ${t.attempt}/${t.maxAttempts} · ${t.dependencies.length} dependencias`}
              status={t.status}
              onOpen={() => ui.document("Detalle de tarea", t)}
            >
              {["failed", "blocked", "interrupted"].includes(t.status) &&
                s.goal && (
                  <button
                    onClick={() =>
                      ui.confirm(
                        "Reintentar tarea",
                        t.title +
                          "\nSe mantienen los límites y la evidencia del intento anterior.",
                        "REINTENTAR",
                        async () => {
                          await ui.execute({
                            type: "retry",
                            goalId: s.goal!.id,
                            taskId: t.id,
                          });
                        },
                      )
                    }
                  >
                    Reintentar
                  </button>
                )}
            </Row>
          )}
        />
      )}
    </>
  );
}
export function Verify({ s }: { s: UiSnapshot }) {
  const ui = useUI();
  return (
    <>
      <Heading
        title="Verificación"
        description="Solo cuenta la evidencia vinculada al candidato actual."
      >
        {s.goal && (
          <button
            onClick={() =>
              void ui.execute({ type: "reverify", goalId: s.goal!.id })
            }
          >
            Volver a verificar
          </button>
        )}
      </Heading>
      {!s.checks.length ? (
        <Empty title="Sin comprobaciones todavía" />
      ) : (
        s.checks.map((c) => (
          <Row
            key={c.id}
            title={c.title}
            detail={`${c.kind} · ${c.summary}`}
            status={c.status}
            onOpen={() => ui.document("Evidencia del check", c)}
          >
            <button onClick={() => ui.navigate("artifacts")}>Evidencia</button>
            {c.kind === "browser" && s.goal && (
              <button
                onClick={() =>
                  ui.confirm(
                    "Abrir preview manual",
                    "Se iniciará una copia aislada del servidor de este contrato. Tus clics no alteran las pruebas automatizadas.",
                    "PREVISUALIZAR",
                    async () => {
                      await request("preview-start", {
                        goalId: s.goal!.id,
                        checkId: c.id,
                        confirmation: "PREVISUALIZAR",
                      });
                    },
                  )
                }
              >
                Preview
              </button>
            )}
          </Row>
        ))
      )}
    </>
  );
}
export function Files({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    [paths, setPaths] = useState<string[]>([]),
    [next, setNext] = useState<number | null>(null),
    [selected, setSelected] = useState(""),
    [content, setContent] = useState(""),
    [error, setError] = useState("");
  const load = async (offset = 0) => {
    try {
      const r = await request("files", { goalId: s.goal?.id, offset });
      const data = r.data as { paths: string[]; next: number | null };
      setPaths((p) => (offset ? [...p, ...data.paths] : data.paths));
      setNext(data.next);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
  }, [s.workspace, s.goal?.revision]);
  return (
    <>
      <Heading
        title="Archivos"
        description="Lectura del candidato aislado. Los secretos y las rutas protegidas no se exponen."
      />
      <div className="file-layout">
        <div className="file-tree">
          {paths.map((path) => (
            <button
              key={path}
              className={selected === path ? "selected" : ""}
              onClick={async () => {
                try {
                  const result = await request("file", {
                    goalId: s.goal?.id,
                    path,
                  });
                  setSelected(path);
                  setContent((result.data as { content: string }).content);
                } catch (e) {
                  ui.notify(String(e));
                }
              }}
            >
              {path}
            </button>
          ))}
          {next !== null && (
            <button onClick={() => void load(next)}>Cargar más</button>
          )}
        </div>
        <div className="file-content">
          <div className="file-heading">
            {selected || "Seleccioná un archivo"}
          </div>
          <pre>{content}</pre>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function Diff({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    [content, setContent] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (s.goal)
      void request("action", { type: "diff", goalId: s.goal.id })
        .then((r) => {
          const value = jsonResult(r.data);
          if (active)
            setContent(
              typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2),
            );
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [s.goal?.id, s.goal?.revision]);
  return (
    <>
      <Heading
        title="Cambios"
        description="Revisión completa del candidato. No se aplican fragmentos sin comprobar su coherencia."
      />
      {!s.goal ? (
        <Empty title="Elegí un objetivo" />
      ) : (
        <>
          <div className="diff">
            <pre>
              {content.split("\n").map((line, i) => (
                <span
                  key={i}
                  className={
                    line.startsWith("+")
                      ? "addition"
                      : line.startsWith("-")
                        ? "deletion"
                        : line.startsWith("@@")
                          ? "hunk"
                          : ""
                  }
                >
                  {line + "\n"}
                </span>
              ))}
            </pre>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="sticky-actions">
            <button
              className="primary"
              disabled={s.goal.state !== "DONE"}
              onClick={() =>
                ui.confirm(
                  "Aplicar cambios verificados",
                  "Se volverá a comprobar la divergencia del checkout original. No se reemplazan cambios tuyos ni se publica a GitHub automáticamente.\nCandidato: " +
                    s.goal!.revision,
                  "APLICAR",
                  async () => {
                    await ui.execute({
                      type: "apply",
                      goalId: s.goal!.id,
                      revision: s.goal!.revision,
                      confirmation: "APPLY",
                    });
                  },
                )
              }
            >
              Aplicar al proyecto
            </button>
            <span>
              {s.goal.state !== "DONE"
                ? "Disponible cuando el Judge acepte la evidencia"
                : "El checkout original se valida antes de escribir"}
            </span>
          </div>
        </>
      )}
    </>
  );
}
export function Costs({ s }: { s: UiSnapshot }) {
  return (
    <>
      <Heading
        title="Consumo"
        description="Los costes estimados no son cargos de tu suscripción; lo desconocido no se convierte en cero."
      />
      {s.accounts.length ? (
        s.accounts.map((a) => (
          <Row
            key={a.account}
            title={a.account}
            detail={`${a.tokens.toLocaleString("es-AR")} tokens reportados · ${a.uncertain} registros con uso desconocido`}
          >
            <span>
              {a.charge !== undefined
                ? `Cargo reportado ${a.charge}`
                : a.estimate !== undefined
                  ? `Estimación ${a.estimate}`
                  : "Cargo no reportado"}
            </span>
          </Row>
        ))
      ) : (
        <Empty title="Todavía no hay consumo reportado" />
      )}
    </>
  );
}
export function Projects({ s }: { s: UiSnapshot }) {
  const [recent, setRecent] = useState<{ id: string; path: string }[]>([]);
  useEffect(() => {
    void request("recent-projects").then((r) =>
      setRecent(r.data as { id: string; path: string }[]),
    );
  }, [s.workspace]);
  const ui = useUI();
  return (
    <>
      <Heading title="Proyecto e historial" description={s.workspace}>
        <button
          className="primary"
          onClick={() =>
            void request("choose-workspace").catch((e) => ui.notify(String(e)))
          }
        >
          Abrir otra carpeta
        </button>
      </Heading>
      <section className="recent-folders">
        {recent
          .filter((r) => r.path !== s.workspace)
          .map((r) => (
            <Row
              key={r.id}
              title={r.path.split(/[\\/]/).at(-1) ?? r.path}
              detail={r.path}
            >
              <button
                onClick={() =>
                  void request("open-recent", { id: r.id }).catch((e) =>
                    ui.notify(String(e)),
                  )
                }
              >
                Abrir proyecto
              </button>
            </Row>
          ))}
      </section>
      {s.recentGoals.length ? (
        s.recentGoals
          .slice()
          .reverse()
          .map((g) => (
            <Row
              key={g.id}
              title={g.request}
              status={g.state}
              onOpen={() => {
                void ui
                  .execute({ type: "select", goalId: g.id })
                  .then(() => ui.navigate("work"));
              }}
            />
          ))
      ) : (
        <Empty title="Esta carpeta aún no tiene objetivos" />
      )}
    </>
  );
}
