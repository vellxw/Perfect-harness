import { processRun } from "../adapters/git/process.js";
import { Blocked } from "../domain/util.js";

export const BLENDER_IMAGE = "perfect-blender:4.5.13";
export const POSTGRES_IMAGE = "postgres:18.6-bookworm";
export interface StudioCapability {
  id: string;
  status: "PASS" | "BLOCKED" | "NOT_TESTED";
  detail: string;
}
export async function studioCapabilities(): Promise<StudioCapability[]> {
  const result: StudioCapability[] = [
    {
      id: "dashi-motion",
      status: "BLOCKED",
      detail: "Licencia de reutilización pendiente; contenido no incluido",
    },
    {
      id: "after-effects",
      status: "NOT_TESTED",
      detail:
        "Requiere editor/licencia del usuario y un ciclo real abrir/guardar/renderizar. No se sustituye por Remotion.",
    },
    {
      id: "rive",
      status: "NOT_TESTED",
      detail:
        "El navegador local de Perfect no autoriza acceso al editor web ni su perfil personal",
    },
    {
      id: "cavalry",
      status: "NOT_TESTED",
      detail:
        "Requiere acceso nativo verificado; un archivo .cv no demuestra que se abrió y exportó",
    },
    {
      id: "image-generation",
      status: "NOT_TESTED",
      detail:
        "La suscripción de texto no habilita una API de imagen. Usá una referencia aprobada o conectá un proveedor autorizado aparte.",
    },
    {
      id: "unity",
      status: "NOT_TESTED",
      detail:
        "Conectá un Editor local con descriptor, perfil, token y catálogo autorizados. Un contrato MCP sintético no certifica Unity.",
    },
  ];
  for (const [id, image] of [
    ["blender-sandbox", BLENDER_IMAGE],
    ["postgres-tests", POSTGRES_IMAGE],
  ]) {
    try {
      const check = await processRun(
        "docker",
        ["image", "inspect", "--format", "{{.Id}}", image!],
        { timeoutMs: 5000 },
      );
      result.push({
        id: id!,
        status: check.code === 0 ? "PASS" : "BLOCKED",
        detail:
          check.code === 0
            ? `Imagen disponible: ${image}. La prueba de producción es independiente.`
            : `Prepará explícitamente la imagen ${image}; no hay instalación ni shell host automáticos.`,
      });
    } catch {
      result.push({
        id: id!,
        status: "BLOCKED",
        detail:
          "Docker no está disponible. No se ejecuta código en el host como fallback.",
      });
    }
  }
  return result;
}
export function assertNativeProfile(profileId: string): void {
  if (["motion-ae", "motion-rive", "motion-cavalry"].includes(profileId))
    throw new Blocked(
      "MOTION_EDITOR_SETUP_REQUIRED",
      "Este perfil requiere licencia y acceso nativo verificado a su editor. No se simula producción ni se cambia de herramienta automáticamente.",
    );
}
