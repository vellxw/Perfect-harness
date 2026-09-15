import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  lstat,
  copyFile,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import type { PerfectConfig } from "../../config/schema.js";
import type { StateStore } from "../../ports/state-store.js";
import type {
  ExecutionRequest,
  ExecutionOutput,
} from "../../ports/execution.js";
import type { OperationIntent } from "../../domain/model.js";
import { Blocked, id, now, hash } from "../../domain/util.js";
import { copySnapshot } from "../git/workspace.js";
import { processRun } from "../git/process.js";
import { relativePath, safePath } from "../../tools/paths.js";
import { confinementArgs, DockerRunner } from "../sandbox/docker.js";
import {
  BLENDER_IMAGE,
  BLENDER_VERSION,
  BlenderSpecSchema,
  validateGlb,
  type BlenderSpec,
} from "./validation.js";
import {
  blenderCollectDriver,
  blenderVerificationDriver,
  glbBrowserDriver,
  glbViewerHtml,
} from "./drivers.js";
const require = createRequire(import.meta.url);
export class BlenderRunner {
  constructor(
    private config: PerfectConfig,
    private store: StateStore,
    private directory: string,
  ) {}
  async run(
    request: ExecutionRequest,
    raw: BlenderSpec,
  ): Promise<ExecutionOutput> {
    const spec = BlenderSpecSchema.parse(raw);
    relativePath(spec.script);
    const docker = new DockerRunner(this.config, this.store, this.directory);
    if (!(await docker.available()))
      throw new Blocked(
        "BLENDER_SANDBOX",
        "Docker no está disponible; no se ejecuta Python host",
      );
    const images: Record<string, string> = {};
    for (const image of [BLENDER_IMAGE, this.config.sandbox.browserImage]) {
      const r = await processRun(
        "docker",
        ["image", "inspect", "--format", "{{.Id}}", image],
        { timeoutMs: 5000 },
      );
      if (r.code || !/^sha256:[a-f0-9]{64}$/.test(r.stdout.trim()))
        throw new Blocked("BLENDER_IMAGE", `Prepará explícitamente ${image}`);
      images[image] = r.stdout.trim();
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(this.directory, "blender-"));
    if (
      /[:,\r\n]/.test(root.replace(/^[A-Za-z]:/, "")) ||
      /[:,\r\n]/.test(request.artifactsDir.replace(/^[A-Za-z]:/, ""))
    )
      throw new Blocked("MOUNT_PATH", "Ruta incompatible con Docker");
    await mkdir(request.artifactsDir, { recursive: true, mode: 0o700 });
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(
        Math.min(spec.timeoutMs, this.config.limits.timeoutPerTask),
      ),
    ]);
    const stage = async (
      name: string,
      image: string,
      args: string[],
      maxOutputBytes = 64000,
    ) => {
      const resource = id("perfect-blender-" + name),
        intent: OperationIntent = {
          id: id("operation"),
          goalId: request.goalId,
          taskId: request.taskId,
          kind: "container",
          status: "started",
          resource,
          beforeRevision: request.revision,
          createdAt: now(),
        };
      this.store.put("intents", intent, "blender.stage_started");
      try {
        const output = await processRun(
          "docker",
          [
            ...confinementArgs(resource, request.goalId, this.config),
            ...args,
            images[image]!,
            "node",
            "/driver/main.mjs",
          ],
          {
            signal,
            timeoutMs: Math.min(
              spec.timeoutMs,
              this.config.limits.timeoutPerTask,
            ),
            maxOutputBytes,
          },
        );
        signal.throwIfAborted();
        return output;
      } finally {
        const check = await processRun(
          "docker",
          [
            "container",
            "inspect",
            "--format",
            '{{ index .Config.Labels "perfect.goal" }}',
            resource,
          ],
          { timeoutMs: 5000 },
        );
        if (!check.code) {
          if (check.stdout.trim() !== request.goalId)
            throw new Blocked("RESOURCE_OWNER_MISMATCH", resource);
          const stopped = await processRun(
            "docker",
            ["rm", "--force", resource],
            { timeoutMs: 10000 },
          );
          if (stopped.code) throw new Blocked("RESOURCE_STOP_FAILED", resource);
        } else if (!/no such (object|container)/i.test(check.stderr))
          throw new Blocked(
            "RESOURCE_UNKNOWN",
            "No se confirmó el cierre; se conserva el intent",
          );
        this.store.put(
          "intents",
          { ...intent, status: "completed" },
          "blender.stage_stopped",
        );
      }
    };
    const unpack = async (
      result: { code: number; stdout: string; stderr: string },
      names: string[],
    ) => {
      if (result.code)
        throw new Blocked(
          "BLENDER_PROCESS",
          result.stderr.slice(-12000) || `Blender terminó con ${result.code}`,
        );
      const lines = result.stdout
        .split(/\r?\n/)
        .filter((l) => l.startsWith("PERFECT_BLENDER_PACKAGE:"));
      if (lines.length !== 1)
        throw new Blocked(
          "BLENDER_OUTPUT_PROTOCOL",
          "Paquete de salida ausente o ambiguo",
        );
      const packet = JSON.parse(
        lines[0]!.slice("PERFECT_BLENDER_PACKAGE:".length),
      ) as { files: Record<string, string>; log: string };
      if (
        !packet.files ||
        Object.keys(packet.files).sort().join("|") !==
          [...names].sort().join("|")
      )
        throw new Blocked(
          "BLENDER_FILES",
          "El script no entregó los archivos solicitados",
        );
      let total = 0;
      for (const name of names) {
        const value = packet.files[name];
        if (typeof value !== "string" || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value))
          throw new Blocked("BLENDER_ENCODING", name);
        const bytes = Buffer.from(value, "base64");
        if (bytes.length < 8 || (total += bytes.length) > spec.maxBytes)
          throw new Blocked("BLENDER_SIZE", name);
        await writeFile(join(request.artifactsDir, name), bytes, {
          flag: "wx",
          mode: 0o600,
        });
      }
      return packet.log.slice(-64000);
    };
    const creation = join(root, "create");
    await mkdir(creation);
    await copySnapshot(request.workspace, join(creation, "input"), this.config);
    await safePath(join(creation, "input"), spec.script);
    await writeFile(
      join(creation, "spec.json"),
      JSON.stringify({ ...spec, stage: "produce" }),
    );
    await writeFile(join(creation, "main.mjs"), blenderCollectDriver);
    const produce = await stage(
      "produce",
      BLENDER_IMAGE,
      [
        "--volume",
        `${creation}/input:/input:ro`,
        "--volume",
        `${creation}/spec.json:/spec.json:ro`,
        "--volume",
        `${creation}/main.mjs:/driver/main.mjs:ro`,
      ],
      Math.ceil(spec.maxBytes * 1.4) + 200000,
    );
    const productionLog = await unpack(produce, [spec.sourceFile]);
    await writeFile(
      join(request.artifactsDir, "production.log"),
      productionLog,
    );
    const source = await readFile(join(request.artifactsDir, spec.sourceFile));
    if (source.toString("ascii", 0, 7) !== "BLENDER")
      throw new Blocked(
        "BLEND_FORMAT",
        "Fuente .blend inválida; este contrato requiere guardado sin compresión",
      );
    const verification = join(root, "verify");
    await mkdir(verification);
    await mkdir(join(verification, "input"));
    await copyFile(
      join(request.artifactsDir, spec.sourceFile),
      join(verification, "input", spec.sourceFile),
    );
    await writeFile(
      join(verification, "spec.json"),
      JSON.stringify({ ...spec, stage: "verify" }),
    );
    await writeFile(join(verification, "main.mjs"), blenderCollectDriver);
    await writeFile(join(verification, "verify.py"), blenderVerificationDriver);
    const verify = await stage(
      "verify",
      BLENDER_IMAGE,
      [
        "--volume",
        `${verification}/input:/input:ro`,
        "--volume",
        `${verification}/spec.json:/spec.json:ro`,
        "--volume",
        `${verification}/main.mjs:/driver/main.mjs:ro`,
        "--volume",
        `${verification}/verify.py:/driver/verify.py:ro`,
      ],
      Math.ceil(spec.maxBytes * 1.4) + 200000,
    );
    const verificationLog = await unpack(verify, [
      "asset.glb",
      "preview.png",
      "verification.json",
    ]);
    await writeFile(
      join(request.artifactsDir, "verification.log"),
      verificationLog,
    );
    const report = JSON.parse(
      await readFile(join(request.artifactsDir, "verification.json"), "utf8"),
    );
    if (
      report.blender !== BLENDER_VERSION ||
      report.sourceReopened !== true ||
      report.meshCount < 1 ||
      report.vertices < 3
    )
      throw new Blocked(
        "BLENDER_VERIFICATION",
        "La verificación independiente no confirmó escena y versión",
      );
    const glb = validateGlb(
      await readFile(join(request.artifactsDir, "asset.glb")),
    );
    const view = join(root, "viewer");
    await mkdir(view);
    await mkdir(join(view, "output"));
    for (const name of ["asset.glb", "preview.png"])
      await copyFile(join(request.artifactsDir, name), join(view, name));
    const threeRoot = dirname(dirname(require.resolve("three")));
    for (const [from, to] of [
      ["build/three.module.js", "three.module.js"],
      ["build/three.core.js", "three.core.js"],
      ["examples/jsm/loaders/GLTFLoader.js", "GLTFLoader.js"],
      ["examples/jsm/utils/BufferGeometryUtils.js", "BufferGeometryUtils.js"],
    ]) {
      let text = await readFile(join(threeRoot, from!), "utf8");
      if (to === "GLTFLoader.js")
        text = text.replace(
          "../utils/BufferGeometryUtils.js",
          "/BufferGeometryUtils.js",
        );
      await writeFile(join(view, to!), text);
    }
    await writeFile(join(view, "index.html"), glbViewerHtml);
    await writeFile(join(view, "main.mjs"), glbBrowserDriver);
    await writeFile(join(view, "spec.json"), JSON.stringify(spec));
    const pwRoot = dirname(require.resolve("playwright/package.json")),
      pwCore = dirname(require.resolve("playwright-core/package.json"));
    const loaded = await stage("loader", this.config.sandbox.browserImage, [
      "--volume",
      `${view}:/input:ro`,
      "--volume",
      `${view}/main.mjs:/driver/main.mjs:ro`,
      "--volume",
      `${view}/spec.json:/spec.json:ro`,
      "--volume",
      `${view}/output:/output:rw`,
      "--volume",
      `${pwRoot}:/driver/node_modules/playwright:ro`,
      "--volume",
      `${pwCore}:/driver/node_modules/playwright-core:ro`,
    ]);
    if (loaded.code)
      throw new Blocked("GLB_RUNTIME", loaded.stderr.slice(-12000));
    for (const name of ["runtime.png", "runtime-report.json"]) {
      const p = await safePath(join(view, "output"), name),
        s = await lstat(p);
      if (!s.isFile() || s.nlink !== 1 || s.size > 8000000)
        throw new Blocked("BLENDER_ARTIFACT", name);
      await copyFile(p, join(request.artifactsDir, name));
    }
    const environment = {
      blender: BLENDER_VERSION,
      blenderImage: images[BLENDER_IMAGE],
      browserImage: images[this.config.sandbox.browserImage],
      sourceHash: hash(source.toString("base64")),
      glb,
      producerFilesystem: "bounded tmpfs; no host output mount",
      validator: "separate process and trusted script",
      network: "none",
    };
    const artifacts: ExecutionOutput["artifacts"] = [
      spec.sourceFile,
      "asset.glb",
      "preview.png",
      "verification.json",
      "runtime.png",
      "runtime-report.json",
      "production.log",
      "verification.log",
    ].map((name) => ({
      path: join(request.artifactsDir, name),
      kind: name.endsWith(".png") ? "frame" : "report",
    }));
    return {
      code: 0,
      stdout:
        "Blender: fuente reabierta por verificador independiente, export GLB cargado/renderizado por Three.js y PNG comprobado",
      stderr: "",
      artifacts,
      environment,
    };
  }
}
