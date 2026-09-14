import type { TextareaRenderable } from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { canonicalCommand, commandName, screenLabel } from "../../i18n/es.js";
import type { UiClient } from "../../presentation/client.js";
import {
  text,
  type AuthMessage,
  type Motion,
  type Screen,
  type UiAction,
} from "../../presentation/protocol.js";
import {
  AgentRail,
  AgentStrip,
  CurrentGoal,
  Document,
  Plate,
  SecretEntry,
  TopBar,
} from "./components.js";
import { glass as g, roles, stateColor, stateIcon } from "./theme/tokens.js";
import {
  commands,
  filterCommands,
  viewRows,
  viewportRows,
  wrapLines,
  type Row,
} from "./views.js";

interface DocumentState {
  title: string;
  content: string;
  path?: string;
}
interface Confirmation {
  title: string;
  body: string;
  phrase: string;
  action?: UiAction;
  local?: () => void;
}
export interface AppProps {
  client: UiClient;
  initialScreen?: Screen;
  onExit: () => void;
  openExternal?: (path: string) => Promise<void>;
}
const screens: Screen[] = [
  "agents",
  "plan",
  "tasks",
  "verify",
  "artifacts",
  "diff",
  "routing",
  "cost",
  "logs",
  "doctor",
  "settings",
  "projects",
];
const help =
  "PERFECT · TECLADO\n\nEnter             Enviar el objetivo o ejecutar una acción\nShift+Enter       Nueva línea (si la terminal lo admite)\nCtrl+J            Nueva línea compatible\n/                 Buscar comandos\nCtrl+K            Acciones rápidas\nTab               Alternar entre actividad y escritura\n↑ / ↓             Elegir un elemento del panel\nPgUp / PgDn       Recorrer actividad o detalles\nEnter en una fila Inspeccionar los detalles\nAlt+A / Alt+P     Agentes / Plan\nAlt+V / Alt+D     Verificación / Cambios\nEsc               Cerrar un panel o volver a escribir\nCtrl+C            Cerrar de forma segura; primero se pausa el trabajo\n\nARCHIVOS\nEnter inspecciona texto. O abre una imagen o video verificado. C copia la ruta verificada. Las trazas y otros archivos no se ejecutan automáticamente.\n\nAPROBACIONES\n/aprobar muestra el plan exacto y sus criterios. /aplicar requiere un objetivo completado y la misma versión verificada. /cancelar conserva el trabajo. Las confirmaciones se escriben expresamente; Enter vacío no autoriza nada.\n\nPRIVACIDAD\nLos objetivos son privados de forma predeterminada. /publico afecta solo al siguiente. Contributor exige un consentimiento separado por carpeta. Nunca se cambia el modelo ni el modo de cobro silenciosamente.\n\nTERMINAL\nLa transparencia y Acrylic dependen de Windows Terminal. No se simula un desenfoque de píxeles en las celdas de texto.\n\nIDIOMA Y COMPATIBILIDAD\nLa aplicación está en español. Los comandos originales también funcionan. Los nombres de modelos, claves JSON, código, rutas y registros externos conservan su forma original para no modificar la evidencia.";
export function App({
  client,
  initialScreen = "home",
  onExit,
  openExternal,
}: AppProps) {
  const s = useSyncExternalStore(
      client.subscribe,
      client.getSnapshot,
      client.getSnapshot,
    ),
    renderer = useRenderer(),
    { width, height } = useTerminalDimensions();
  const compact = width < 100 || height < 30,
    rail = width >= 130 && height >= 30;
  const [screen, setScreen] = useState<Screen>(initialScreen),
    [selected, setSelected] = useState(0),
    [focus, setFocus] = useState<"composer" | "feed">("composer");
  const [query, setQuery] = useState(""),
    [quick, setQuick] = useState(false),
    [paletteIndex, setPaletteIndex] = useState(0);
  const [document, setDocument] = useState<DocumentState>(),
    [offset, setOffset] = useState(0),
    [confirmation, setConfirmation] = useState<Confirmation>();
  const [toast, setToast] = useState(""),
    [auth, setAuth] = useState<AuthMessage>(),
    [publicGoal, setPublicGoal] = useState(false),
    [closing, setClosing] = useState(false);
  const input = useRef<TextareaRenderable | null>(null),
    history = useRef<string[]>([]),
    historyIndex = useRef(0),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const motion = s.preferences.ui.motion;
  const notify = useCallback((message: string) => {
    setToast(text(message, 500));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const showDocument = useCallback(
    (title: string, content: string, path?: string) => {
      setDocument({ title, content, path });
      setOffset(0);
    },
    [],
  );
  useEffect(
    () =>
      client.onMessage((message) => {
        if (message.type === "fault") notify(message.message);
        if (message.type === "auth") {
          setAuth(message);
          setScreen("login");
        }
        if (message.type === "result") {
          notify(message.message);
          if (message.content !== undefined)
            showDocument(
              message.operation
                ? "Evidencia"
                : "Cambios de la versión candidata",
              message.content,
              message.path,
            );
          else if (message.path && message.operation === "inspect")
            showDocument(
              "Archivo verificado",
              `${message.message}\n\n${message.path}\n\nUsá O en /archivos para abrir una imagen o un video.`,
              message.path,
            );
          if (message.path && message.operation === "copy") {
            const copied = renderer.copyToClipboardOSC52(message.path);
            notify(
              copied
                ? "Ruta del archivo verificado copiada"
                : "Portapapeles no disponible; se muestra la ruta",
            );
            if (!copied) showDocument("Ruta del archivo", message.path);
          }
          if (message.path && message.operation === "open") {
            if (openExternal)
              void openExternal(message.path).catch((error) =>
                notify(String(error)),
              );
            else notify("Este renderizador no permite abrir archivos externos");
          }
        }
      }),
    [client, notify, showDocument, renderer, openExternal],
  );
  useEffect(() => {
    if (
      s.connected &&
      !s.demo &&
      !s.preferences.ui.onboarded &&
      initialScreen === "home"
    ) {
      setScreen("doctor");
      client.dispatch({ type: "doctor", online: false });
    }
  }, [s.connected, client, initialScreen, s.demo, s.preferences.ui.onboarded]);
  const paletteOpen = quick || (query.startsWith("/") && !query.includes(" "));
  const palette = useMemo(
    () =>
      quick
        ? commands.filter((c) =>
            [
              "pause",
              "resume",
              "approve",
              "retry",
              "diff",
              "reverify",
              "abort",
              "apply",
            ].includes(c.name),
          )
        : filterCommands(query),
    [query, quick],
  );
  const rows = useMemo(() => viewRows(s, screen), [s, screen]);
  const rowHeight = compact ? 2 : 3,
    visibleRows = Math.max(
      1,
      Math.floor(
        (height -
          (compact ? 17 : 24) -
          (s.goal?.reason ? (compact ? 2 : 4) : 0) -
          (toast ? (compact ? 1 : 2) : 0) +
          (rail ? 2 : 0)) /
          rowHeight,
      ),
    );
  const activeSelected = Math.min(
    Math.max(0, selected),
    Math.max(0, rows.length - 1),
  );
  const shown = viewportRows(
    rows,
    screen === "home" && focus === "composer"
      ? rows.length - 1
      : activeSelected,
    visibleRows,
  );
  const mutate = (action: UiAction) => {
    client.dispatch(action);
  };
  const requireGoal = () => {
    if (!s.goal) {
      notify("Primero iniciá o seleccioná un objetivo");
      return undefined;
    }
    return s.goal;
  };
  const setComposer = (value: string) => {
    input.current?.setText(value);
    setQuery(value);
  };
  const clearComposer = () => setComposer("");
  const navigate = (next: Screen) => {
    setScreen(next);
    setSelected(0);
    setDocument(undefined);
    setOffset(0);
    setQuick(false);
    if (next !== "home") setFocus("feed");
  };
  const requestContributor = () =>
    setConfirmation({
      title: "Muse Contributor · compartir datos",
      phrase: "COMPARTIR",
      body: `Los mensajes de Contributor pueden usarse para entrenamiento. Habilitalo solo para código público que tengas permiso de compartir. Los secretos y proyectos confidenciales siguen prohibidos.\n\nCarpeta:\n${s.workspace}\n\nEscribí COMPARTIR para autorizar esta carpeta. Usá /contribuir revocar para revocar el permiso.`,
      action: { type: "contributor", allow: true },
    });
  const command = (name: string, rest = "") => {
    name = canonicalCommand(name);
    if (name === "status" || name === "home") {
      navigate("home");
      setFocus("composer");
      return;
    }
    setQuick(false);
    if (screens.includes(name as Screen)) {
      navigate(name as Screen);
      if (name === "doctor") mutate({ type: "doctor", online: false });
      if (name === "diff") {
        const goal = requireGoal();
        if (goal) mutate({ type: "diff", goalId: goal.id });
      }
      return;
    }
    const goal = s.goal;
    switch (name) {
      case "home":
        navigate("home");
        setFocus("composer");
        break;
      case "goal":
        if (!rest.trim()) {
          setComposer("/objetivo ");
          setFocus("composer");
          return;
        }
        if (s.busy) {
          notify(
            "Hay una ejecución activa. Pausala antes de iniciar otro objetivo.",
          );
          return;
        }
        mutate({ type: "goal", description: rest, public: publicGoal });
        setPublicGoal(false);
        navigate("home");
        setFocus("composer");
        break;
      case "pause":
      case "resume":
      case "reverify":
        if (requireGoal()) mutate({ type: name, goalId: goal!.id });
        break;
      case "approve":
        if (requireGoal() && s.plan)
          setConfirmation({
            title: "Aprobar el plan de implementación",
            phrase: "APROBAR",
            body: `Plan v${s.plan.version}\n${s.plan.summary}\n\nCRITERIOS DE ACEPTACIÓN\n${s.plan.criteria.map((c) => `• ${c.description}`).join("\n")}\n\n${s.plan.risks.join("\n")}\n\nSe aprueba este plan exacto, no cambios futuros de alcance.`,
            action: {
              type: "approve",
              goalId: goal!.id,
              planHash: s.plan.hash,
            },
          });
        else notify("No hay un plan listo para aprobar");
        break;
      case "abort":
        if (requireGoal())
          setConfirmation({
            title: "¿Cancelar este objetivo?",
            phrase: "CANCELAR",
            body: "La ejecución actual se detendrá. Se conservarán los puntos de recuperación y la evidencia. Tu trabajo no se borrará.",
            action: { type: "abort", goalId: goal!.id, confirmation: "ABORT" },
          });
        break;
      case "apply":
        if (requireGoal())
          setConfirmation({
            title: "¿Aplicar los cambios verificados?",
            phrase: "APLICAR",
            body: `Versión candidata ${goal!.revision}\n\nSe aplicarán los cambios verificados a la carpeta original. Perfect lo impedirá si el objetivo no está completado, si la versión candidata cambió o si la carpeta original fue modificada.\n\n${s.workspace}`,
            action: {
              type: "apply",
              goalId: goal!.id,
              revision: goal!.revision,
              confirmation: "APPLY",
            },
          });
        break;
      case "retry":
        if (!rest) {
          navigate("tasks");
          notify("Seleccioná una tarea fallida y presioná R para reintentar");
        } else if (requireGoal())
          mutate({ type: "retry", goalId: goal!.id, taskId: rest.trim() });
        break;
      case "workspace":
        if (!rest) {
          notify("Usá /carpeta seguido de la ruta de una carpeta");
          setComposer("/carpeta ");
          return;
        }
        mutate({ type: "workspace", path: rest.replace(/^"(.*)"$/, "$1") });
        navigate("home");
        break;
      case "login":
        if (["xai", "openai-codex", "opencode"].includes(rest)) {
          navigate("login");
          setAuth(undefined);
          mutate({
            type: "login",
            provider: rest as "xai" | "openai-codex" | "opencode",
          });
        } else {
          navigate("settings");
          notify("Elegí el proveedor que querés conectar");
        }
        break;
      case "contributor":
        if (["revoke", "revocar"].includes(rest))
          mutate({ type: "contributor", allow: false });
        else requestContributor();
        break;
      case "public":
        setConfirmation({
          title: "Procesamiento público del próximo objetivo",
          phrase: "PUBLICO",
          body: "Declarás que el próximo objetivo y su código pueden procesarse en una ruta pública/Contributor. Esto no habilita por sí solo el consentimiento. No lo uses con código privado de clientes, secretos ni datos personales.",
          local: () => {
            setPublicGoal(true);
            notify(
              "Próximo objetivo: público. Aún se necesita consentimiento para esta carpeta.",
            );
          },
        });
        break;
      case "private":
        setPublicGoal(false);
        notify("Próximo objetivo: privado");
        break;
      case "prepare":
        if (requireGoal())
          setConfirmation({
            title: "Preparar dependencias con acceso a la red",
            phrase: "DESCARGAR",
            body: "Se descargarán paquetes públicos de npm en una imagen aislada a partir de los manifiestos de la versión candidata. No se permiten scripts de instalación ni credenciales de registros privados. Primero pausá el objetivo. El resultado aparecerá al terminar.",
            action: {
              type: "prepare",
              goalId: goal!.id,
              allowNetwork: true,
              render: rest === "render",
            },
          });
        break;
      case "help":
        showDocument("Perfect · teclado y seguridad", help);
        break;
      case "exit":
        setClosing(true);
        onExit();
        break;
      default:
        notify(
          `Comando desconocido /${name}. Escribí / para ver las acciones.`,
        );
    }
  };
  const submit = () => {
    if (paletteOpen) {
      const item = palette[Math.min(paletteIndex, palette.length - 1)];
      if (item) {
        if (item.args) {
          setComposer(`/${commandName(item.name)} `);
          setQuick(false);
        } else {
          clearComposer();
          command(item.name);
        }
      }
      return;
    }
    const value = (input.current?.plainText ?? query).trim();
    if (!value) return;
    if (value.length > 100000) {
      notify("El mensaje supera el límite de 100.000 caracteres");
      return;
    }
    if (history.current.at(-1) !== value)
      history.current = [...history.current.slice(-49), value];
    historyIndex.current = history.current.length;
    clearComposer();
    if (value.startsWith("/")) {
      const split = value.indexOf(" ");
      command(
        value.slice(1, split < 0 ? undefined : split),
        split < 0 ? "" : value.slice(split + 1),
      );
    } else command("goal", value);
  };
  const activate = (row: Row | undefined) => {
    if (!row) return;
    if (screen === "projects") {
      mutate({ type: "select", goalId: row.id });
      navigate("home");
      return;
    }
    if (screen === "artifacts" && s.goal) {
      mutate({
        type: "artifact",
        goalId: s.goal.id,
        evidenceId: row.id,
        operation: "inspect",
      });
      return;
    }
    if (screen === "settings") {
      const prefs = structuredClone(s.preferences);
      if (row.id === "motion") {
        const modes: Motion[] = ["auto", "full", "reduced", "off"];
        prefs.ui.motion =
          modes[(modes.indexOf(prefs.ui.motion) + 1) % modes.length]!;
        mutate({ type: "preferences", preferences: prefs });
        return;
      }
      if (row.id === "contrast") {
        prefs.ui.contrast = prefs.ui.contrast === "normal" ? "high" : "normal";
        mutate({ type: "preferences", preferences: prefs });
        return;
      }
      if (row.id === "transparent") {
        prefs.ui.transparent = !prefs.ui.transparent;
        mutate({ type: "preferences", preferences: prefs });
        return;
      }
      if (row.id.startsWith("login-")) {
        command("login", row.id.slice(6));
        return;
      }
      if (row.id === "contributor") {
        requestContributor();
        return;
      }
      if (row.id === "doctor") {
        command("doctor");
        return;
      }
    }
    showDocument(row.title, row.body);
  };
  useKeyboard((key) => {
    if (confirmation) return;
    if (auth?.promptId) {
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        key.preventDefault();
        mutate({ type: "auth-cancel" });
        setAuth(undefined);
        navigate("home");
      }
      return;
    }
    if (key.ctrl && key.name === "c") {
      key.preventDefault();
      if (!closing) {
        setClosing(true);
        onExit();
      }
      return;
    }
    if (key.name === "escape") {
      key.preventDefault();
      if (document) {
        setDocument(undefined);
        return;
      }
      if (quick) {
        setQuick(false);
        return;
      }
      if (paletteOpen) {
        clearComposer();
        return;
      }
      if (screen === "login") {
        mutate({ type: "auth-cancel" });
        setAuth(undefined);
      }
      navigate("home");
      setFocus("composer");
      return;
    }
    if (key.ctrl && key.name === "k") {
      key.preventDefault();
      setQuick((v) => !v);
      setPaletteIndex(0);
      return;
    }
    if (key.meta && ["a", "p", "v", "d"].includes(key.name)) {
      key.preventDefault();
      command(
        (
          { a: "agents", p: "plan", v: "verify", d: "diff" } as Record<
            string,
            string
          >
        )[key.name]!,
      );
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      setFocus((f) => (f === "composer" ? "feed" : "composer"));
      if (focus === "composer") setSelected(Math.max(0, rows.length - 1));
      return;
    }
    if (document) {
      if (
        ["up", "down", "pageup", "pagedown", "home", "end"].includes(key.name)
      ) {
        key.preventDefault();
        const total = wrapLines(document.content, width - 14).length;
        setOffset((n) =>
          key.name === "home"
            ? 0
            : key.name === "end"
              ? Math.max(0, total - height + 12)
              : Math.max(
                  0,
                  Math.min(
                    Math.max(0, total - 1),
                    n +
                      ({
                        up: -1,
                        down: 1,
                        pageup: -(height - 12),
                        pagedown: height - 12,
                      }[key.name] ?? 0),
                  ),
                ),
        );
      }
      if (key.name === "n" || key.name === "p") {
        key.preventDefault();
        const lines = wrapLines(document.content, width - 14),
          starts = lines
            .map((l, i) => (l.startsWith("diff --git") ? i : -1))
            .filter((i) => i >= 0),
          next =
            key.name === "n"
              ? starts.find((i) => i > offset)
              : starts.findLast((i) => i < offset);
        if (next !== undefined) setOffset(next);
      }
      return;
    }
    if (paletteOpen) {
      if (key.name === "up" || key.name === "down") {
        key.preventDefault();
        setPaletteIndex((n) =>
          Math.max(
            0,
            Math.min(palette.length - 1, n + (key.name === "up" ? -1 : 1)),
          ),
        );
      }
      if (key.name === "return") {
        key.preventDefault();
        submit();
      }
      return;
    }
    if (screen === "login" && auth?.url && key.name === "o") {
      key.preventDefault();
      if (openExternal)
        void openExternal(auth.url).catch((error) => notify(String(error)));
      return;
    }
    if (
      screen === "doctor" &&
      key.name === "c" &&
      !s.preferences.ui.onboarded
    ) {
      key.preventDefault();
      const prefs = structuredClone(s.preferences);
      prefs.ui.onboarded = true;
      mutate({ type: "preferences", preferences: prefs });
      navigate("settings");
      return;
    }
    if (focus === "feed" || screen !== "home") {
      if (
        ["up", "down", "pageup", "pagedown", "home", "end"].includes(key.name)
      ) {
        key.preventDefault();
        setSelected((n) =>
          key.name === "home"
            ? 0
            : key.name === "end"
              ? Math.max(0, rows.length - 1)
              : Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    n +
                      ({
                        up: -1,
                        down: 1,
                        pageup: -visibleRows,
                        pagedown: visibleRows,
                      }[key.name] ?? 0),
                  ),
                ),
        );
      }
      if (key.name === "return") {
        key.preventDefault();
        activate(rows[activeSelected]);
      }
      if (
        screen === "artifacts" &&
        ["o", "c"].includes(key.name) &&
        s.goal &&
        rows[activeSelected]
      ) {
        key.preventDefault();
        mutate({
          type: "artifact",
          goalId: s.goal.id,
          evidenceId: rows[activeSelected]!.id,
          operation: key.name === "o" ? "open" : "copy",
        });
      }
      if (
        screen === "tasks" &&
        key.name === "r" &&
        s.goal &&
        rows[activeSelected]
      ) {
        key.preventDefault();
        mutate({
          type: "retry",
          goalId: s.goal.id,
          taskId: rows[activeSelected]!.id,
        });
      }
      if (screen === "plan" && key.name === "a") {
        key.preventDefault();
        command("approve");
      }
    } else if (key.meta && ["up", "down"].includes(key.name)) {
      key.preventDefault();
      historyIndex.current = Math.max(
        0,
        Math.min(
          history.current.length,
          historyIndex.current + (key.name === "up" ? -1 : 1),
        ),
      );
      setComposer(history.current[historyIndex.current] ?? "");
    }
  });
  const showList = screen !== "home" && screen !== "login";
  const modalRows = viewportRows(
    rows,
    activeSelected,
    Math.max(1, Math.floor((height - 15) / 2)),
  );
  const paletteRows = viewportRows(
    palette,
    Math.min(paletteIndex, Math.max(0, palette.length - 1)),
    Math.max(1, Math.min(9, height - 14)),
  );
  const border = focus === "composer" ? g.edge : g.border,
    muted = s.preferences.ui.contrast === "high" ? g.secondary : g.muted;
  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={s.preferences.ui.transparent ? "transparent" : g.void}
      paddingX={width >= 100 ? 1 : 0}
    >
      <box
        flexDirection="column"
        flexGrow={1}
        border
        borderStyle="rounded"
        borderColor={g.edge}
        backgroundColor={
          s.preferences.ui.transparent ? "transparent" : g.surface
        }
      >
        <TopBar snapshot={s} compact={compact} />
        <CurrentGoal snapshot={s} compact={compact} />
        {!rail && width >= 100 && s.goal && <AgentStrip agents={s.agents} />}
        <box flexDirection="row" flexGrow={1} paddingX={2} minHeight={2}>
          <box
            flexDirection="column"
            flexGrow={1}
            overflow="hidden"
            paddingRight={rail ? 2 : 0}
          >
            <box height={2} flexDirection="row" justifyContent="space-between">
              <text fg={muted}>
                {s.goal ? "ACTIVIDAD" : "EMPEZÁ CON UN OBJETIVO"}
              </text>
              <text fg={muted}>
                {focus === "feed"
                  ? "↑↓ elegir · Enter ver"
                  : "Tab para inspeccionar"}
              </text>
            </box>
            {!rows.length && screen === "home" ? (
              <box
                flexDirection="column"
                flexGrow={1}
                justifyContent="center"
                paddingBottom={2}
              >
                <text fg={g.highlight}>
                  {
                    "Planificá con claridad. Construí con cuidado. Verificá el resultado."
                  }
                </text>
                <box height={1} />
                <text fg={g.secondary}>
                  {
                    "Tu código permanece intacto hasta que apliques un resultado verificado."
                  }
                </text>
                <box height={1} />
                <text fg={muted}>
                  {"/carpeta elegir carpeta · /diagnostico revisar · /conectar"}
                </text>
              </box>
            ) : (
              shown.rows.map((row, i) => (
                <box
                  key={row.id}
                  flexDirection="column"
                  height={rowHeight}
                  flexShrink={0}
                  backgroundColor={
                    focus === "feed" && shown.offset + i === activeSelected
                      ? g.focused
                      : "transparent"
                  }
                  paddingX={1}
                  onMouseDown={() => {
                    setFocus("feed");
                    setSelected(shown.offset + i);
                  }}
                >
                  <text fg={g.text} height={1}>
                    <span fg={stateColor(row.status)}>
                      {stateIcon(row.status)}{" "}
                    </span>
                    <span
                      fg={
                        roles[
                          s.activity.find((a) => a.id === row.id)?.role ?? ""
                        ]?.color ?? g.text
                      }
                    >
                      {row.title}
                    </span>
                  </text>
                  <text fg={g.secondary} height={1}>
                    {" "}
                    {row.detail || "Enter para inspeccionar"}
                  </text>
                </box>
              ))
            )}
          </box>
          {rail && (
            <AgentRail
              agents={s.agents}
              motion={motion}
              rows={Math.max(8, height - 17)}
            />
          )}
        </box>
        <box flexDirection="column" paddingX={2} paddingTop={1} flexShrink={0}>
          {toast && (
            <text fg={g.warning} height={compact ? 1 : 2}>
              {toast}
            </text>
          )}
          <box
            border
            borderStyle="rounded"
            borderColor={border}
            paddingX={1}
            flexDirection="row"
            height={compact ? 3 : 4}
            backgroundColor={
              s.preferences.ui.transparent ? "transparent" : g.raised
            }
          >
            <text fg={g.highlight} width={2}>
              ›
            </text>
            <textarea
              id="composer"
              ref={input}
              flexGrow={1}
              focused={
                focus === "composer" &&
                screen === "home" &&
                !document &&
                !confirmation &&
                !auth?.promptId &&
                !quick &&
                !closing
              }
              placeholder={
                s.busy
                  ? "Trabajando…  / acciones"
                  : "Pedile a Perfect qué construir…  / acciones"
              }
              placeholderColor={muted}
              textColor={g.text}
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              keyBindings={[
                { name: "return", action: "submit" },
                { name: "return", shift: true, action: "newline" },
                { name: "j", ctrl: true, action: "newline" },
              ]}
              onSubmit={submit}
              onContentChange={() => {
                setQuery((input.current?.plainText ?? "").slice(0, 100001));
                setPaletteIndex(0);
              }}
            />
          </box>
          <box
            height={2}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <text fg={muted}>
              /agentes /plan /verificar /cambios
              {width >= 100 ? "    Ctrl+K acciones" : ""}
            </text>
            <text fg={publicGoal ? g.warning : muted}>
              {closing
                ? "Pausando de forma segura…"
                : !s.connected
                  ? "motor sin conexión"
                  : `${publicGoal ? "PÚBLICO" : "PRIVADO"} · ${s.version}`}
            </text>
          </box>
        </box>
      </box>
      {showList && (
        <Plate
          title={
            screen === "verify"
              ? "Verificación · versión actual"
              : screenLabel(screen)
          }
          width={width}
          height={height}
          motion={motion}
          footer={
            screen === "artifacts"
              ? "↑↓ elegir · Enter ver · O abrir · C copiar ruta"
              : screen === "plan"
                ? "↑↓ tareas · Enter detalle · A aprobar el plan"
                : screen === "doctor" && !s.preferences.ui.onboarded
                  ? "C configurar proveedores · Esc volver"
                  : "↑↓ elegir · Enter detalle · Esc cerrar"
          }
        >
          {screen === "plan" && s.plan && (
            <box height={4} flexDirection="column">
              <text fg={g.text}>{s.plan.summary}</text>
              <text fg={s.plan.approved ? g.success : g.warning}>
                Plan v{s.plan.version} ·{" "}
                {s.plan.approved ? "aprobado" : "falta aprobación"} ·{" "}
                {s.plan.criteria.length} criterios
              </text>
              <text fg={muted}>
                {
                  "Se muestran todas las dependencias, sin duplicar tareas compartidas."
                }
              </text>
            </box>
          )}
          {!rows.length && (
            <text fg={g.secondary}>
              {screen === "doctor"
                ? "Revisando este equipo…"
                : "Todavía no hay registros en esta sección."}
            </text>
          )}
          {modalRows.rows.map((row, i) => (
            <box
              key={row.id}
              height={2}
              flexShrink={0}
              flexDirection="column"
              backgroundColor={
                modalRows.offset + i === activeSelected
                  ? g.focused
                  : "transparent"
              }
              onMouseDown={() => {
                setSelected(modalRows.offset + i);
              }}
            >
              <text fg={g.text}>
                <span fg={stateColor(row.status)}>
                  {modalRows.offset + i === activeSelected
                    ? "›"
                    : stateIcon(row.status)}{" "}
                </span>
                {row.title}
              </text>
              <text fg={g.secondary}> {row.detail}</text>
            </box>
          ))}
          <box flexGrow={1} />
        </Plate>
      )}
      {screen === "login" && (
        <Plate
          title="Conectá tu proveedor"
          width={width}
          height={height}
          motion={motion}
          footer="Las credenciales quedan fuera de Git y no aparecen en la telemetría."
        >
          <text fg={g.text}>
            {auth?.provider ?? "Preparando la autenticación…"}
          </text>
          <box height={1} />
          <text fg={g.secondary}>
            {auth?.message ??
              "Usá /conectar xai, /conectar openai-codex o /conectar opencode."}
          </text>
          {auth?.url && (
            <box flexDirection="column" paddingY={1}>
              <text fg={g.accent}>{text(auth.url, 2000)}</text>
              <text fg={g.muted}>
                {"O abrir la autorización en tu navegador"}
              </text>
            </box>
          )}
          {auth?.code && (
            <text fg={g.highlight}>
              {"Código del dispositivo:"}
              {auth.code}
            </text>
          )}
          {auth?.options?.map((o, i) => (
            <text key={o.id} fg={g.secondary}>
              {i + 1}. {o.label}
            </text>
          ))}
          {auth?.promptId &&
            (auth.secret ? (
              <SecretEntry
                key={auth.promptId}
                onSubmit={(value) => {
                  if (typeof value !== "string") return;
                  mutate({
                    type: "auth-answer",
                    promptId: auth.promptId!,
                    value,
                  });
                  setAuth({ ...auth, promptId: undefined });
                }}
                onCancel={() => {
                  mutate({ type: "auth-cancel" });
                  setAuth(undefined);
                  navigate("home");
                }}
              />
            ) : (
              <input
                key={auth.promptId}
                focused
                placeholder="Pegá el valor de autorización y presioná Enter"
                onSubmit={(value) => {
                  if (typeof value !== "string") return;
                  mutate({
                    type: "auth-answer",
                    promptId: auth.promptId!,
                    value,
                  });
                  setAuth({ ...auth, promptId: undefined });
                }}
              />
            ))}
          {auth?.done && (
            <text fg={g.muted}>
              {
                "Esc vuelve a Perfect. /diagnostico revisa la conexión configurada."
              }
            </text>
          )}
          <box flexGrow={1} />
        </Plate>
      )}
      {paletteOpen && !confirmation && (
        <Plate
          title={quick ? "Acciones rápidas" : "Comandos"}
          width={width}
          height={height}
          motion={motion}
          footer="Escribí para filtrar · ↑↓ elegir · Enter ejecutar · Esc cerrar"
        >
          {paletteRows.rows.map((item, i) => (
            <box
              key={commandName(item.name)}
              height={2}
              flexShrink={0}
              flexDirection="row"
              backgroundColor={
                paletteRows.offset + i ===
                Math.min(paletteIndex, palette.length - 1)
                  ? g.focused
                  : "transparent"
              }
            >
              <text fg={g.highlight} width={17}>
                {paletteRows.offset + i === paletteIndex ? "›" : " "} /
                {commandName(item.name)}
              </text>
              <text fg={g.secondary} flexGrow={1}>
                {item.description}
              </text>
            </box>
          ))}
          <box flexGrow={1} />
        </Plate>
      )}
      {document && !confirmation && (
        <Plate
          title={document.title}
          width={width}
          height={height}
          motion={motion}
          footer="↑↓ / PgUp PgDn mover · N/P archivo siguiente/anterior · Esc cerrar"
        >
          <Document
            content={document.content}
            width={width - 14}
            height={height - 12}
            offset={offset}
          />
        </Plate>
      )}
      {confirmation && (
        <Confirm
          confirmation={confirmation}
          width={width}
          height={height}
          motion={motion}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => {
            if (confirmation.action) mutate(confirmation.action);
            confirmation.local?.();
            setConfirmation(undefined);
          }}
        />
      )}
    </box>
  );
}
function Confirm({
  confirmation: c,
  width,
  height,
  motion,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation;
  width: number;
  height: number;
  motion: Motion;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [value, setValue] = useState("");
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      onCancel();
    }
  });
  return (
    <Plate
      title={c.title}
      width={width}
      height={height}
      motion={motion}
      footer="Esc cancela · Solo se autoriza este plan o esta versión"
    >
      <Document
        content={c.body}
        width={width - 14}
        height={Math.max(3, height - 17)}
      />
      <text fg={g.warning}>Escribí {c.phrase} para confirmar</text>
      <box
        height={3}
        border
        borderStyle="rounded"
        borderColor={g.edge}
        paddingX={1}
      >
        <input
          focused
          value={value}
          placeholder={c.phrase}
          onInput={setValue}
          onSubmit={(input) => {
            if (input === c.phrase) onConfirm();
          }}
        />
      </box>
    </Plate>
  );
}
