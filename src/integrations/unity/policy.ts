import { realpath } from "node:fs/promises";
import { Blocked } from "../../domain/util.js";
import type { TaskSpec } from "../../domain/model.js";
import type { Effect } from "../types.js";
import type { UnityPolicy } from "./schema.js";
import { safeResource } from "../../skills/importer.js";

const READ = new Set([
  "console_read_logs",
  "console_get_count",
  "compile_status",
  "test_results",
  "scene_browse_hierarchy",
  "scene_list",
  "inspect_read",
  "inspect_list",
  "asset_find",
  "asset_info",
  "play_mode_status",
  "project_assemblies",
  "project_packages",
  "job_status",
  "animator_inspect",
  "animator_audit",
  "memory_usage",
  "ui_hit_test",
  "capture_screenshot",
]);
const WRITE = new Set([
  "gameobject_create",
  "gameobject_duplicate",
  "gameobject_reparent",
  "gameobject_set_transform",
  "gameobject_set_active",
  "scene_save",
  "scene_create",
  "prefab_create",
  "prefab_instantiate",
  "material_create",
  "material_set",
]);
const INTERACT = new Set([
  "compile_request",
  "test_run",
  "play_mode_play",
  "play_mode_stop",
  "play_mode_pause",
  "play_mode_unpause",
  "play_mode_step",
  "ui_click",
]);
export function unityEffect(
  policy: UnityPolicy,
  tool: string,
): Effect | undefined {
  if (READ.has(tool)) return "read";
  if (policy.writeMode !== "confirm") return undefined;
  return WRITE.has(tool)
    ? "write"
    : INTERACT.has(tool)
      ? "interactive"
      : undefined;
}
export function unityGrants(policy: UnityPolicy): Record<string, Effect> {
  return Object.fromEntries(
    [...READ, ...WRITE, ...INTERACT].flatMap((tool) => {
      const effect = unityEffect(policy, tool);
      return effect ? [[tool, effect]] : [];
    }),
  );
}
export function validateUnityCall(
  policy: UnityPolicy,
  tool: string,
  args: Record<string, unknown>,
): Effect {
  const effect = unityEffect(policy, tool);
  if (!effect)
    throw new Blocked(
      "UNITY_TOOL_DENIED",
      "La herramienta no forma parte de la allowlist revisada; las annotations remotas no conceden permisos",
    );
  if (
    tool === "capture_screenshot" &&
    (args.save_path !== undefined ||
      !["game", "scene"].includes(String(args.view ?? "game")))
  )
    throw new Blocked(
      "UNITY_CAPTURE_SCOPE",
      "Solo vistas renderizadas game/scene, sin capturar otras ventanas ni escribir archivos externos",
    );
  if (tool === "play_mode_step" && args.paths !== undefined)
    throw new Blocked(
      "UNITY_REFLECTION_DENIED",
      "No se permite reflexión indirecta",
    );
  const visit = (value: unknown, key = "", depth = 0): void => {
    if (depth > 20)
      throw new Blocked(
        "UNITY_ARGUMENT_DEPTH",
        "Argumentos demasiado profundos",
      );
    if (
      ["save_path", "script", "code", "assembly", "file_content"].includes(key)
    )
      throw new Blocked(
        "UNITY_CODE_DENIED",
        "No se admite código ni escritura externa por esta herramienta",
      );
    if (
      typeof value === "string" &&
      /^(?:asset_path|folder|folder_path|source_path|destination_path|scene_path|controller_path|clip_path|prefab_path|material_path|path)$/.test(
        key,
      )
    ) {
      safeResource(value);
      if (value !== "Assets" && !value.startsWith("Assets/"))
        throw new Blocked(
          "UNITY_ASSET_SCOPE",
          "Solo assets del proyecto autorizado",
        );
    }
    if (Array.isArray(value))
      for (const entry of value) visit(entry, key, depth + 1);
    else if (value && typeof value === "object")
      for (const [name, entry] of Object.entries(value))
        visit(entry, name, depth + 1);
  };
  visit(args);
  return effect;
}
export async function validateUnityWorkspace(
  policy: UnityPolicy,
  run: { profileId?: string; cwd: string; readOnly: boolean; task?: TaskSpec },
  effect: Effect,
): Promise<void> {
  if (!run.profileId || !policy.profileIds.includes(run.profileId))
    throw new Blocked(
      "UNITY_PROFILE_DENIED",
      "El perfil no está autorizado para este Editor",
    );
  try {
    process.kill(policy.editorPid, 0);
  } catch {
    throw new Blocked(
      "UNITY_EDITOR_STOPPED",
      "El Editor ya no está disponible; se requiere reconexión",
    );
  }
  if (effect !== "read") {
    if (run.readOnly)
      throw new Blocked(
        "UNITY_READ_ONLY",
        "El revisor no puede editar el proyecto",
      );
    if ((await realpath(run.cwd)) !== (await realpath(policy.projectPath)))
      throw new Blocked(
        "UNITY_MANAGED_PROJECT",
        "Abrí la copia administrada exacta de esta tarea en Unity antes de editar",
      );
    if (!run.task?.ownedFiles.includes("Assets"))
      throw new Blocked(
        "UNITY_OWNERSHIP",
        "La autoría nativa requiere propiedad exclusiva de Assets para esta tarea",
      );
  }
}
