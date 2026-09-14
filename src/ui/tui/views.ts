import type {
  Screen,
  UiSnapshot,
  UiTask,
} from "../../presentation/protocol.js";
import { text } from "../../presentation/protocol.js";
export interface Row {
  id: string;
  title: string;
  detail: string;
  status: string;
  body: string;
}
export interface PaletteItem {
  name: string;
  description: string;
  args?: string;
}
export const commands: PaletteItem[] = [
  {
    name: "goal",
    description: "Start a goal without touching the original checkout",
    args: "Describe what to build",
  },
  {
    name: "agents",
    description: "Inspect the actual agents and model routing",
  },
  {
    name: "plan",
    description: "Review architecture, acceptance criteria and dependencies",
  },
  { name: "tasks", description: "All tasks, attempts and ownership" },
  {
    name: "verify",
    description: "Checks and evidence on the current candidate",
  },
  {
    name: "artifacts",
    description: "Screenshots, renders, traces and reports",
  },
  { name: "diff", description: "Review the candidate changes" },
  {
    name: "routing",
    description: "Requested, sent and reported model identity",
  },
  {
    name: "cost",
    description: "Observed usage, uncertain requests and billing",
  },
  {
    name: "logs",
    description: "Recent structured activity; expand with Enter",
  },
  { name: "pause", description: "Stop scheduling and preserve checkpoints" },
  { name: "resume", description: "Recover and resume the current goal" },
  { name: "approve", description: "Approve the exact plan currently shown" },
  {
    name: "retry",
    description: "Retry a failed task without resetting limits",
    args: "task-id",
  },
  { name: "abort", description: "Stop the goal with explicit confirmation" },
  {
    name: "apply",
    description: "Apply a verified DONE candidate after confirmation",
  },
  {
    name: "reverify",
    description: "Re-run the accepted checks on a paused goal",
  },
  {
    name: "doctor",
    description: "Check this computer without sending an inference",
  },
  { name: "settings", description: "Motion, contrast and privacy" },
  { name: "projects", description: "Recent goals in this workspace" },
  {
    name: "workspace",
    description: "Choose a local source folder",
    args: "path",
  },
  {
    name: "login",
    description: "Connect a provider locally",
    args: "xai | openai-codex | opencode",
  },
  {
    name: "contributor",
    description: "Review Muse Contributor data-sharing consent",
  },
  {
    name: "public",
    description: "Declare the next goal suitable for public processing",
  },
  { name: "private", description: "Keep the next goal private (default)" },
  {
    name: "prepare",
    description: "Approve public npm downloads for a paused goal",
  },
  { name: "help", description: "Keyboard shortcuts and safety controls" },
  { name: "exit", description: "Pause active work safely and close Perfect" },
];
export function filterCommands(query: string): PaletteItem[] {
  const q = query.replace(/^\//, "").split(/\s/)[0]!.toLowerCase();
  return commands.filter(
    (c) => c.name.includes(q) || c.description.toLowerCase().includes(q),
  );
}
export function orderedTasks(
  tasks: UiTask[],
): { task: UiTask; depth: number }[] {
  const byId = new Map(tasks.map((t) => [t.id, t])),
    depths = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    if (depths.has(id)) return depths.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d =
      1 +
      Math.max(
        -1,
        ...(byId.get(id)?.dependencies ?? [])
          .filter((d) => byId.has(d))
          .map((d) => depth(d, new Set(seen))),
      );
    depths.set(id, d);
    return d;
  };
  return tasks
    .map((task) => ({ task, depth: depth(task.id, new Set()) }))
    .sort((a, b) => a.depth - b.depth || a.task.id.localeCompare(b.task.id));
}
export function viewRows(s: UiSnapshot, screen: Screen): Row[] {
  switch (screen) {
    case "agents":
    case "routing":
      return s.agents.map((a) => ({
        id: a.id,
        title: `${a.role} · ${a.status}`,
        detail: `${a.provider}/${a.model} · ${a.selected}`,
        status: a.status,
        body: [
          `ROLE        ${a.role}`,
          `PROVIDER    ${a.provider}`,
          `ACCOUNT     ${a.account}`,
          `MODEL       ${a.model}`,
          `REPORTED    ${a.modelReported ?? "unknown (not exposed)"}`,
          `REQUESTED   ${a.requested}`,
          `SELECTED    ${a.selected}`,
          `SENT        ${a.sent ?? "not observed"}`,
          `REPORTED    ${a.reported ?? "unknown (not exposed)"}`,
          `TASK        ${a.task ?? "none"}`,
          `REQUESTS    ${a.requests}`,
          `TOKENS      ${a.tokens?.toLocaleString() ?? "unknown"}`,
          `LATENCY     ${a.latencyMs === undefined ? "unknown" : `${a.latencyMs} ms`}`,
          `PROVENANCE  ${a.provenance}`,
          "",
          "A configured model is not evidence of a completed inference.",
        ].join("\n"),
      }));
    case "plan":
    case "tasks":
      return orderedTasks(s.tasks).map(({ task: t, depth }) => ({
        id: t.id,
        title: `${"  ".repeat(Math.min(depth, 6))}${depth ? "↳ " : ""}${t.title}`,
        detail: `${t.role} · attempt ${t.attempt}/${t.maxAttempts}${t.dependencies.length ? ` · after ${t.dependencies.join(", ")}` : ""}`,
        status: t.status,
        body: [
          t.description,
          "",
          `Dependencies: ${t.dependencies.join(", ") || "none"}`,
          `Ownership: ${t.surfaces.join(", ") || "read-only"}`,
          `Status: ${t.status}`,
          `Attempt ${t.attempt}/${t.maxAttempts}`,
        ].join("\n"),
      }));
    case "verify":
      return s.checks.map((c) => ({
        id: c.id,
        title: c.title,
        detail: `${c.kind} · ${c.status}`,
        status: c.status,
        body: `${c.summary}\n\nCandidate: ${c.revision}\nEvidence: ${c.evidenceIds.join(", ") || "not produced"}\n\nUse /artifacts to inspect the original evidence.`,
      }));
    case "artifacts":
      return s.artifacts.map((a) => ({
        id: a.id,
        title: a.name,
        detail: `${a.kind} · ${a.current ? "current candidate" : "older candidate"}`,
        status: a.current ? "completed" : "waiting",
        body: `Kind: ${a.kind}\nCandidate: ${a.revision}\nSHA256: ${a.hash}\n\nEnter inspects verified text. O opens a verified image/video. C copies the verified path. Other formats require explicit external inspection.`,
      }));
    case "cost":
      return s.accounts.map((a) => ({
        id: a.account,
        title: a.account,
        detail: `${a.tokens.toLocaleString()} reported tokens · ${a.uncertain} uncertain requests`,
        status: "info",
        body: `Reported tokens: ${a.tokens.toLocaleString()}\nRequests with unknown usage: ${a.uncertain}\nObserved charge: ${a.charge === undefined ? "not reported" : `USD ${a.charge.toFixed(4)}`}\nEstimated metered charge: ${a.estimate === undefined ? "not applicable / unknown" : `USD ${a.estimate.toFixed(4)}`}\n\nSubscription quota is not a per-token invoice. Unknown does not mean zero.`,
      }));
    case "doctor":
      return s.diagnostics.map((d) => ({
        id: d.name,
        title: d.name,
        detail: d.status,
        status:
          d.status === "PASS"
            ? "passed"
            : d.status === "BLOCKED"
              ? "blocked"
              : "waiting",
        body: d.detail,
      }));
    case "projects":
      return s.recentGoals.map((g) => ({
        id: g.id,
        title: g.request,
        detail: g.state,
        status: g.state,
        body: `${g.id}\n${g.state}`,
      }));
    case "settings":
      return [
        {
          id: "motion",
          title: "Motion",
          detail: s.preferences.ui.motion,
          status: "info",
          body: "Auto reduces motion on remote, CI and constrained terminals. Animations stop when idle.",
        },
        {
          id: "contrast",
          title: "High contrast",
          detail: s.preferences.ui.contrast,
          status: "info",
          body: "Increases muted text contrast. States always have labels and symbols.",
        },
        {
          id: "transparent",
          title: "Terminal background",
          detail: s.preferences.ui.transparent ? "transparent" : "solid",
          status: "info",
          body: "Window blur is provided by Windows Terminal Acrylic, not by terminal cells.",
        },
        {
          id: "login-xai",
          title: "Connect xAI",
          detail: "Subscription OAuth",
          status: "info",
          body: "Authenticate locally; no token is stored in the repository.",
        },
        {
          id: "login-openai-codex",
          title: "Connect ChatGPT / Codex",
          detail: "Subscription OAuth",
          status: "info",
          body: "Authenticate locally using the configured Pi provider.",
        },
        {
          id: "login-opencode",
          title: "Connect OpenCode",
          detail: "Muse Contributor API key",
          status: "info",
          body: "Contributor content may be used for training; workspace consent is separate.",
        },
        {
          id: "contributor",
          title: "Contributor privacy",
          detail: "Consent is per workspace, never automatic",
          status: "waiting",
          body: "Only public goals may use Contributor. Never share secrets or confidential code.",
        },
        {
          id: "doctor",
          title: "Check this computer",
          detail: "No inference is sent",
          status: "info",
          body: "Inspect runtime, Git, Docker, browser images and configured providers.",
        },
      ];
    case "home":
    case "logs":
      return s.activity.map((a) => ({
        id: a.id,
        title: `${a.role} · ${a.title}`,
        detail: a.detail,
        status: a.status,
        body: `${a.title}\n${a.detail}\n\n${a.time}\nEvent ${a.sequence}: ${a.rawType}`,
      }));
    default:
      return [];
  }
}
export function wrapLines(value: string, width: number): string[] {
  const result: string[] = [];
  const n = Math.max(12, width);
  for (const line of text(value, 1000000).split("\n")) {
    if (!line) {
      result.push("");
      continue;
    }
    let rest = line;
    while (rest.length > n) {
      let cut = rest.lastIndexOf(" ", n);
      if (cut < n / 3) cut = n;
      result.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    result.push(rest);
  }
  return result;
}
export function viewportRows<T>(
  rows: T[],
  selected: number,
  height: number,
): { rows: T[]; offset: number } {
  const n = Math.max(1, height),
    offset = Math.max(
      0,
      Math.min(rows.length - n, selected - Math.floor(n / 2)),
    );
  return { rows: rows.slice(offset, offset + n), offset };
}
