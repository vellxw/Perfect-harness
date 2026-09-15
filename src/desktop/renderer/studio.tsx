/** @jsxImportSource react */
import { useState } from "react";
import type { UiSnapshot } from "../contracts/protocol.js";
import type { AgentProfile } from "../../skills/model.js";
import {
  useUI,
  Heading,
  Empty,
  Switch,
  Row,
  VirtualList,
  options,
  label,
  splitLines,
} from "./ui.js";
export function Skills({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    p = s.studio,
    [search, setSearch] = useState(""),
    [team, setTeam] = useState("*");
  if (!p)
    return (
      <>
        <Heading title="Habilidades" />
        <Empty title="Cargar el catálogo local">
          <button
            onClick={() =>
              void ui.execute({ type: "studio", action: { command: "status" } })
            }
          >
            Cargar habilidades
          </button>
        </Empty>
      </>
    );
  const config = p.config;
  const perform = (action: Record<string, unknown>, show = false) =>
    ui.execute({ type: "studio", action }, show);
  const importSkill = () =>
    ui.form({
      title: "Importar una skill pública",
      description:
        "Se descarga únicamente una versión fijada, sin ejecutar instaladores. Entra en cuarentena; no se habilita por importarla.",
      submit: "Importar a cuarentena",
      phrase: "IMPORTAR",
      fields: [
        {
          name: "repository",
          label: "Repositorio propietario/nombre",
          required: true,
        },
        {
          name: "commit",
          label: "Commit completo (40 caracteres)",
          required: true,
        },
        {
          name: "path",
          label: "Ruta del directorio de la skill",
          required: true,
        },
        {
          name: "licenses",
          label: "Rutas de licencia, una por línea",
          type: "textarea",
          value: "LICENSE",
        },
        {
          name: "teams",
          label: "Equipos autorizados, IDs separados por coma",
          value: "frontend-web",
          required: true,
        },
        {
          name: "triggers",
          label: "Activadores, uno por línea",
          type: "textarea",
        },
        {
          name: "localOnly",
          label: "Distribución",
          type: "select",
          value: "true",
          options: [
            { value: "true", label: "Solo uso local" },
            { value: "false", label: "Según la licencia verificada" },
          ],
        },
      ],
      onSubmit: async (v) => {
        await perform(
          {
            command: "import-github",
            input: {
              repository: v.repository,
              commit: v.commit,
              path: v.path,
              licenseFiles: splitLines(v.licenses ?? ""),
              defaultSets: (v.teams ?? "").split(",").map((s) => s.trim()),
              triggers: splitLines(v.triggers ?? ""),
              localOnly: v.localOnly === "true",
            },
            confirmation: "IMPORTAR",
          },
          true,
        );
      },
    });
  const importLocal = () =>
    ui.form({
      title: "Importar habilidad local",
      description:
        "Elegí un directorio externo al proyecto. No se ejecutan scripts. Declarar una licencia no concede derechos de terceros.",
      submit: "Importar a cuarentena",
      phrase: "IMPORTAR",
      fields: [
        {
          name: "directory",
          label: "Carpeta de la habilidad",
          type: "directory",
          required: true,
        },
        {
          name: "teams",
          label: "Equipos (IDs separados por coma)",
          value: "general",
          required: true,
        },
        {
          name: "license",
          label: "Licencia declarada",
          value: "MIT",
          required: true,
        },
        {
          name: "redistribution",
          label: "Derechos de distribución",
          type: "select",
          value: "unknown",
          options: [
            { value: "unknown", label: "Pendiente de verificar" },
            { value: "local-only", label: "Solo local, con permiso" },
            { value: "allowed", label: "Reutilización permitida por licencia" },
          ],
        },
        {
          name: "triggers",
          label: "Activadores, uno por línea",
          type: "textarea",
        },
      ],
      onSubmit: async (v) => {
        await perform(
          {
            command: "import-local",
            directory: v.directory,
            defaultSets: (v.teams ?? "").split(",").map((s) => s.trim()),
            triggers: splitLines(v.triggers ?? ""),
            license: v.license,
            redistribution: v.redistribution,
            confirmation: "IMPORTAR",
          },
          true,
        );
      },
    });
  const assign = (skill: (typeof p.skills)[number]) =>
    ui.form({
      title: "Ámbito · " + skill.name,
      description:
        "Global significa disponible, no cargada siempre. Una exclusión explícita prevalece.",
      submit: "Guardar asignación",
      fields: [
        {
          name: "target",
          label: "Destinatario",
          type: "select",
          value: "global",
          options: [
            { value: "global", label: "Todos los agentes" },
            ...config.sets.map((t) => ({
              value: "set:" + t.id,
              label: "Equipo · " + t.name,
            })),
            ...config.profiles.map((a) => ({
              value: "profile:" + a.id,
              label: "Perfil · " + a.name,
            })),
          ],
        },
        {
          name: "decision",
          label: "Disponibilidad",
          type: "select",
          value: "inherit",
          options: [
            { value: "inherit", label: "Heredar" },
            { value: "enable", label: "Activar" },
            { value: "disable", label: "Desactivar" },
          ],
        },
      ],
      onSubmit: async (v) => {
        const [scope, target] = (v.target ?? "global").split(":");
        await perform({
          command: "assign",
          assignment: {
            skillId: skill.id,
            scope,
            target,
            decision: v.decision,
          },
          expectedHash: p.hash,
        });
      },
    });
  const choose = (skill: (typeof p.skills)[number]) => {
    const selected = p.control.manual.some(
      (pin) => pin.releaseId === skill.releaseId,
    );
    ui.confirm(
      selected ? "Quitar selección manual" : "Seleccionar versión exacta",
      `${skill.name}\n${skill.hash}\n${selected ? "No se elimina el paquete ni sus evidencias." : "Se cargará únicamente en perfiles autorizados. Dependencias incluidas: " + skill.pins.map((x) => x.skillId).join(", ")}`,
      "SELECCIONAR",
      async () => {
        await perform({
          command: "manual-select",
          releaseId: skill.releaseId,
          hash: skill.hash,
          selected: !selected,
          expectedEpoch: p.control.epoch,
          pins: skill.pins,
          confirmation: "SELECCIONAR",
        });
      },
    );
  };
  const filtered = p.skills.filter(
    (skill) =>
      `${skill.name} ${skill.description}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (team === "*" || skill.defaultSets.includes(team)),
  );
  return (
    <>
      <Heading
        title="Habilidades"
        description="Conocimiento específico, solo para el equipo que lo necesita."
      >
        <button onClick={() => ui.navigate("trials")}>Crear y evaluar</button>
        <button onClick={importLocal}>Desde carpeta</button>
        <button onClick={importSkill}>Importar de GitHub</button>
      </Heading>
      <section className="settings-strip">
        <Switch
          checked={p.masterEnabled}
          label="Sistema de habilidades"
          onChange={() =>
            p.masterEnabled
              ? void perform({ command: "master", enabled: false })
              : ui.confirm(
                  "Activar habilidades",
                  "Se mantienen todas las restricciones por paquete, carpeta, equipo y perfil.",
                  "ACTIVAR",
                  async () => {
                    await perform({
                      command: "master",
                      enabled: true,
                      confirmation: "ACTIVAR",
                    });
                  },
                )
          }
        />
        <label>
          Selección de esta carpeta
          <select
            aria-label="Modo de habilidades"
            value={config.skills.mode}
            onChange={(e) =>
              void perform({
                command: "skill-mode",
                mode: e.target.value,
                expectedHash: p.hash,
              })
            }
          >
            <option value="off">Desactivada</option>
            <option value="manual">Manual estricta</option>
            <option value="auto-curated">Automática por equipo</option>
          </select>
        </label>
        <span>{p.control.manual.length} versiones seleccionadas</span>
      </section>
      <div className="filters">
        <input
          className="search"
          aria-label="Buscar habilidad"
          placeholder="Buscar habilidad o procedimiento"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filtrar por equipo"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          <option value="*">Todos los equipos</option>
          {config.sets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <VirtualList
        items={filtered}
        height={460}
        rowHeight={96}
        render={(skill) => (
          <Row
            title={skill.name}
            detail={`${skill.defaultSets.join(" · ")} · ${skill.status}`}
            onOpen={() =>
              void perform(
                { command: "inspect", releaseId: skill.releaseId },
                true,
              )
            }
          >
            <button onClick={() => assign(skill)}>Ámbitos</button>
            {skill.reviewed ? (
              <>
                <button
                  aria-pressed={p.control.manual.some(
                    (pin) => pin.releaseId === skill.releaseId,
                  )}
                  disabled={!skill.enabled}
                  onClick={() => choose(skill)}
                >
                  {p.control.manual.some(
                    (pin) => pin.releaseId === skill.releaseId,
                  )
                    ? "Seleccionada"
                    : "Seleccionar"}
                </button>
                <button
                  onClick={() =>
                    void perform({
                      command: "selection",
                      skillId: skill.id,
                      enabled: !skill.enabled,
                      hash: skill.hash,
                    })
                  }
                >
                  {skill.enabled ? "Desactivar" : "Habilitar"}
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  ui.confirm(
                    "Aprobar habilidad revisada",
                    `${skill.name}\nLicencia: ${skill.license}\nHash: ${skill.hash}\nInspeccioná primero el contenido. Aprobar estructura no demuestra que mejora al modelo.`,
                    "APROBAR",
                    async () => {
                      await perform({
                        command: "approve",
                        releaseId: skill.releaseId,
                        hash: skill.hash,
                        confirmation: "APROBAR",
                      });
                    },
                  )
                }
              >
                Aprobar
              </button>
            )}
          </Row>
        )}
      />
      <section className="settings-strip">
        <Switch
          checked={!config.skills.disabledPackages.includes("superpowers")}
          label="Paquete Superpowers"
          onChange={() =>
            config.skills.disabledPackages.includes("superpowers")
              ? ui.confirm(
                  "Permitir Superpowers",
                  "Puede añadir procedimientos y contexto. No instala contenido ni hooks; solo permite versiones importadas y revisadas.",
                  "ACTIVAR",
                  async () => {
                    await perform({
                      command: "package",
                      id: "superpowers",
                      enabled: true,
                      confirmation: "ACTIVAR",
                      expectedHash: p.hash,
                    });
                  },
                )
              : void perform({
                  command: "package",
                  id: "superpowers",
                  enabled: false,
                  expectedHash: p.hash,
                })
          }
        />
        <small>
          Desactivado por defecto. Las dependencias no pueden reactivarlo.
        </small>
      </section>
      <details>
        <summary>Candidatos y licencias pendientes</summary>
        {p.candidates.map((c) => (
          <Row
            key={c.id}
            title={c.id}
            detail={`${c.status} · ${c.reason}`}
            onOpen={() => ui.document("Procedencia del candidato", c)}
          />
        ))}
      </details>
    </>
  );
}
export function Teams({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    p = s.studio;
  if (!p)
    return <Empty title="Abrí Habilidades para cargar la configuración" />;
  const edit = (id?: string) => {
    const old = p.config.sets.find((t) => t.id === id);
    ui.form({
      title: old ? "Renombrar equipo" : "Nuevo equipo",
      submit: "Guardar equipo",
      fields: [
        ...(old
          ? []
          : [
              {
                name: "id",
                label: "Identificador (sin espacios)",
                required: true,
              },
            ]),
        {
          name: "name",
          label: "Nombre del equipo",
          value: old?.name,
          required: true,
        },
      ],
      onSubmit: async (v) => {
        await ui.execute({
          type: "studio",
          action: {
            command: "set",
            set: {
              id: old?.id ?? v.id,
              name: v.name,
              enabled: old?.enabled ?? true,
            },
            expectedHash: p.hash,
          },
        });
      },
    });
  };
  return (
    <>
      <Heading
        title="Equipos"
        description="Los modelos pueden coincidir; sus conocimientos y permisos no se mezclan."
      >
        <button className="primary" onClick={() => edit()}>
          Crear equipo
        </button>
      </Heading>
      {p.config.sets.map((t) => (
        <section className="team-section" key={t.id}>
          <Row
            title={t.name}
            detail={`${t.id} · ${p.config.profiles.filter((a) => a.setIds.includes(t.id)).length} perfiles`}
          >
            <button onClick={() => edit(t.id)}>Renombrar</button>
            <Switch
              checked={t.enabled}
              label={"Habilitar " + t.name}
              onChange={() =>
                void ui.execute({
                  type: "studio",
                  action: {
                    command: "set",
                    set: { ...t, enabled: !t.enabled },
                    expectedHash: p.hash,
                  },
                })
              }
            />
          </Row>
          <div className="chips">
            {p.config.profiles
              .filter((a) => a.setIds.includes(t.id))
              .map((a) => (
                <button key={a.id} onClick={() => ui.navigate("profiles")}>
                  {a.name}
                </button>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
export function Profiles({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    p = s.studio;
  if (!p) return <Empty title="Cargá primero la configuración local" />;
  const save = (profile: AgentProfile) =>
    ui.execute({
      type: "studio",
      action: { command: "profile", profile, expectedHash: p.hash },
    });
  const model = (profile: AgentProfile) =>
    ui.form({
      title: "Modelo · " + profile.name,
      description:
        "La ruta se comprueba antes de guardar. No cambia equipos ni permisos y no habilita gasto automáticamente.",
      submit: "Guardar ruta",
      phrase: "CAMBIAR",
      fields: [
        {
          name: "provider",
          label: "Proveedor",
          value: profile.binding.provider,
          required: true,
        },
        {
          name: "model",
          label: "Modelo exacto",
          value: profile.binding.model,
          required: true,
        },
        {
          name: "reasoning",
          label: "Razonamiento",
          type: "select",
          value: profile.binding.reasoning,
          options: options([
            "off",
            "minimal",
            "low",
            "medium",
            "high",
            "xhigh",
            "max",
          ]),
        },
        {
          name: "accountRef",
          label: "Cuenta local",
          value: profile.binding.accountRef,
          required: true,
        },
        {
          name: "auth",
          label: "Autenticación",
          type: "select",
          value: profile.binding.auth,
          options: [
            { value: "oauth", label: "OAuth de cuenta" },
            { value: "api_key", label: "Clave API" },
          ],
        },
        {
          name: "billingMode",
          label: "Modalidad de facturación",
          type: "select",
          value: profile.binding.billingMode,
          options: [
            { value: "subscription", label: "Suscripción" },
            { value: "free", label: "Gratuita" },
            { value: "metered", label: "Por uso (requiere permiso adicional)" },
          ],
        },
      ],
      onSubmit: async (v) => {
        await ui.execute({
          type: "studio",
          action: {
            command: "binding",
            profileId: profile.id,
            binding: { ...profile.binding, ...v },
            expectedHash: p.hash,
            confirmation: "CAMBIAR",
          },
        });
      },
    });
  const membership = (profile: AgentProfile) =>
    ui.form({
      title: "Equipos · " + profile.name,
      description:
        "Los equipos solo cambian habilidades disponibles. El rol y los permisos se mantienen.",
      submit: "Guardar equipos",
      phrase: "APLICAR",
      fields: [
        {
          name: "ids",
          label: "Equipos autorizados (separados por coma)",
          value: profile.setIds.join(", "),
          help: p.config.sets.map((t) => `${t.id}: ${t.name}`).join(" · "),
          required: true,
        },
      ],
      onSubmit: async (v) => {
        await save({
          ...profile,
          setIds: (v.ids ?? "").split(",").map((s) => s.trim()),
        });
      },
    });
  return (
    <>
      <Heading
        title="Perfiles y modelos"
        description="Responsabilidad, cuenta, modelo y equipos son configuraciones independientes."
      />
      {p.config.profiles.map((a) => (
        <Row
          key={a.id}
          title={a.name}
          detail={`${label(a.role)} · ${a.binding.provider}/${a.binding.model} · ${a.binding.reasoning} · ${a.setIds.join(", ")}`}
          onOpen={() => ui.document("Perfil completo", a)}
        >
          <button onClick={() => membership(a)}>Equipos</button>
          <button
            onClick={() =>
              void ui.execute(
                {
                  type: "studio",
                  action: { command: "catalog", profileId: a.id, query: "" },
                },
                true,
              )
            }
          >
            Catálogo
          </button>
          <button onClick={() => model(a)}>Cambiar modelo</button>
          <Switch
            checked={a.enabled}
            label={"Perfil " + a.name}
            onChange={() => void save({ ...a, enabled: !a.enabled })}
          />
        </Row>
      ))}
    </>
  );
}
export function Modes({ s }: { s: UiSnapshot }) {
  const ui = useUI(),
    p = s.studio;
  if (!p) return <Empty title="Cargá la configuración local" />;
  return (
    <>
      <Heading
        title="Modos de trabajo"
        description="El mismo harness, con perfiles adecuados a cada resultado."
      />
      <div className="mode-grid">
        {p.config.modes.map((m) => (
          <button
            className={`mode-card ${p.config.activeMode === m.id ? "selected" : ""}`}
            key={m.id}
            aria-pressed={p.config.activeMode === m.id}
            disabled={!m.enabled}
            onClick={() =>
              ui.confirm(
                "Seleccionar " + m.name,
                m.instruction +
                  "\n\nEl modo afecta nuevos objetivos. No modifica el plan de una goal anterior.",
                "APLICAR",
                async () => {
                  await ui.execute({
                    type: "studio",
                    action: {
                      command: "mode",
                      modeId: m.id,
                      expectedHash: p.hash,
                    },
                  });
                },
              )
            }
          >
            <span className="mode-symbol">
              {m.id === "game-creator"
                ? "◇"
                : m.id === "motion-studio"
                  ? "↗"
                  : m.id === "skill-studio"
                    ? "✧"
                    : "◈"}
            </span>
            <h3>{m.name}</h3>
            <p>{m.instruction}</p>
            <small>
              {m.profiles.length} perfiles ·{" "}
              {p.config.activeMode === m.id ? "Seleccionado" : "Elegir modo"}
            </small>
          </button>
        ))}
      </div>
    </>
  );
}
