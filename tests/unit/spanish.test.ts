import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArgs, commandName, canonicalCommand, stateLabel, roleLabel, reasoningLabel, numberLabel } from "../../src/i18n/es.js";
import { humanMessage } from "../../src/i18n/messages.js";
import { humanData, configureSpanishHelp } from "../../src/cli/spanish.js";
import { Command } from "commander";

test("los alias españoles no traducen el objetivo, las rutas ni argumentos literales", () => {
  assert.deepEqual(normalizeArgs(["--carpeta", "C:\\Proyectos\\conectar", "objetivo", "Crear niños y niñas", "--publico"]), ["--workspace", "C:\\Proyectos\\conectar", "goal", "Crear niños y niñas", "--public"]);
  assert.deepEqual(normalizeArgs(["objetivo", "--", "--publico", "cancelar", "status"]), ["goal", "--", "--publico", "cancelar", "status"]);
  assert.deepEqual(normalizeArgs(["conectar", "opencode", "--clave-env", "MI_CLAVE", "--cuenta=personal"]), ["login", "opencode", "--key-env", "MI_CLAVE", "--account=personal"]);
  assert.deepEqual(normalizeArgs(["--carpeta=./objetivo", "estado", "--json"]), ["--workspace=./objetivo", "status", "--json"]);
  assert.deepEqual(normalizeArgs(["ayuda", "objetivo"]), ["help", "goal"]);
  assert.deepEqual(normalizeArgs(["goal", "resume", "private"]), ["goal", "resume", "private"]);
  assert.equal(canonicalCommand("diagnóstico"), "doctor");
  assert.equal(commandName("resume"), "reanudar");
});

test("las etiquetas españolas no cambian los estados ni inventan niveles de razonamiento", () => {
  const raw = { state: "DONE", provider: "opencode", model: "muse-spark-1.3-contributor-free", reasoning: "xhigh" };
  const before = JSON.stringify(raw);
  const output = humanData(raw);
  assert.match(output, /completado/);
  assert.match(output, /muse-spark-1\.3-contributor-free/);
  assert.match(output, /xhigh/);
  assert.doesNotMatch(output, /Max|máximo/);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(reasoningLabel(undefined), "no observado");
  assert.equal(reasoningLabel("xhigh"), "extraalto (xhigh)");
  assert.equal(stateLabel("NOT_TESTED"), "NO PROBADO");
  assert.equal(roleLabel("planner"), "Planificador");
  assert.equal(numberLabel(18450), "18.450");
});

test("la localización conserva los códigos de bloqueo y los mensajes externos originales", () => {
  assert.equal(humanMessage("SANDBOX_REQUIRED: Docker is unavailable; no host-shell fallback is permitted"), "SANDBOX_REQUIRED: Docker no está disponible; no se permite ejecutar comandos directamente en el equipo como alternativa");
  assert.match(humanMessage("Inspect perfect plan, then run perfect approve-plan goal-123 and perfect resume goal-123"), /aprobar-plan goal-123.*reanudar goal-123/);
  const original = "External library: TypeError at src/EnglishName.ts:123";
  assert.equal(humanMessage(original), original);
  assert.equal(humanMessage("Requested grok-4.6; service reported other-model"), "Solicitado: grok-4.6; informado por el servicio: other-model");
});

test("Commander conserva la ejecución real con nombres españoles y ayuda localizada", async () => {
  const p = new Command().name("perfect").exitOverride();
  let called = false;
  p.command("status").description("Mostrar el estado").action(() => { called = true; });
  configureSpanishHelp(p);
  assert.match(p.helpInformation(), /Uso:/);
  assert.match(p.helpInformation(), /Comandos:/);
  assert.match(p.helpInformation(), /estado\|status/);
  assert.doesNotMatch(p.helpInformation(), /Usage:|Options:|Commands:|display help/);
  await p.parseAsync(["estado"], { from: "user" });
  assert.equal(called, true);
});
