// Anchor-checked one-time migration; removed after validated source is published.
import fs from 'node:fs';
const patch=(path,a,b)=>{const s=fs.readFileSync(path,'utf8');if(!s.includes(a))throw Error('Missing anchor '+path+': '+a.slice(0,120));fs.writeFileSync(path,s.replace(a,b));};
const prepend=(path,code)=>fs.writeFileSync(path,code+'\n'+fs.readFileSync(path,'utf8'));
const protocol='src/presentation/protocol.ts',engine='src/presentation/engine.ts',app='src/ui/tui/app.tsx',wire='src/integrations/wire.ts',session='src/integrations/agent-session.ts';
prepend(protocol,'import { IntegrationActionSchema, type IntegrationPanelSnapshot } from "../integrations/actions.js";');
patch(protocol,'export interface UiSnapshot {','export interface UiSnapshot {\n  integrations?: IntegrationPanelSnapshot;');
patch(protocol,'export type Screen =','export type Screen = "integrations" |');
patch(protocol,'export const UiActionSchema = z.discriminatedUnion("type", [','export const UiActionSchema = z.discriminatedUnion("type", [\n  z.object({ type: z.literal("integration"), action: IntegrationActionSchema }).strict(),');
prepend(engine,'import { IntegrationAdmin } from "../integrations/admin.js";');
patch(engine,'  readonly store: SqliteStore;','  readonly store: SqliteStore;\n  readonly integrations: IntegrationAdmin;');
patch(engine,'    this.store = new SqliteStore(join(home, "state.sqlite"));','    this.store = new SqliteStore(join(home, "state.sqlite"));\n    this.integrations = new IntegrationAdmin(home);');
patch(engine,'if (name?.startsWith("state.sqlite")) this.wake();','if (name?.startsWith("state.sqlite") || name?.startsWith("integrations.sqlite")) this.wake();');
patch(engine,'      ),\n      serialized = JSON.stringify(state);','      );\n    const integrationState = this.integrations.snapshot(this.workspace);\n    if (integrationState.connections.length || integrationState.pending.length || integrationState.windows.length) state.integrations = integrationState;\n    const serialized = JSON.stringify(state);');
patch(engine,'      switch (action.type) {',`      switch (action.type) {
        case "integration": {
          if (action.action.command === "login") {
            this.idle();
            this.integrations.credentialKey(this.workspace, action.action.id);
            void this.authenticateIntegration(action.action.id);
            message = "Ingresá la credencial en el campo enmascarado";
          } else {
            const result = await this.integrations.perform(this.workspace, action.action, AbortSignal.timeout(60000));
            message = result.message; content = result.content; operation = "integration";
          }
          break;
        }`);
patch(engine,'  private async authenticate(provider: string): Promise<void> {',`  private async authenticateIntegration(serverId: string): Promise<void> {
    const controller = new AbortController(); this.authAbort = controller;
    const workspace = this.workspace, promptId = id("integration-secret");
    try {
      const value = await new Promise<string>((resolveAnswer, reject) => {
        const cancel = () => { this.answers.delete(promptId); reject(new Error("Conexión cancelada")); };
        controller.signal.addEventListener("abort", cancel, { once: true });
        this.answers.set(promptId, value => { controller.signal.removeEventListener("abort", cancel); resolveAnswer(value); });
        this.send({ type: "auth", provider: serverId, promptId, secret: true,
          message: "Ingresá una credencial con los permisos mínimos del servicio. Se guarda solo en este equipo (DPAPI en Windows; archivo privado en Linux). No se envía a un modelo ni se incluye en el repositorio." });
      });
      controller.signal.throwIfAborted();
      await this.integrations.credential(workspace, serverId, value);
      this.send({ type: "auth", provider: serverId, message: "Credencial guardada. Probá la conexión y revisá su catálogo en /integraciones.", done: true });
    } catch (error) {
      this.send({ type: "auth", provider: serverId, message: error instanceof Blocked ? humanMessage(text(error)) : "No se guardó la credencial o se canceló la conexión.", done: true });
    } finally { this.answers.delete(promptId); this.authAbort = undefined; this.publish(); }
  }
  private async authenticate(provider: string): Promise<void> {`);
patch(engine,'    this.store.close();','    this.integrations.close();\n    this.store.close();');
prepend('src/ui/tui/views.ts','import { integrationRows } from "./integration-view.js";');
patch('src/ui/tui/views.ts','  switch (screen) {','  switch (screen) {\n    case "integrations": return integrationRows(s);');
patch('src/ui/tui/views.ts','export const commands: PaletteItem[] = [','export const commands: PaletteItem[] = [\n  { name: "integrations", description: "Conexiones MCP, permisos y ventanas autorizadas" },\n  { name: "github", description: "Conectar el servidor oficial a un repositorio", args: "propietario/repositorio" },\n  { name: "browser", description: "Navegador interactivo de la aplicación aislada" },\n  { name: "desktop", description: "Elegir una ventana de Windows" },\n  { name: "detener-escritorio", description: "Revocar el control del escritorio" },\n  { name: "mcp-importar", description: "Importar una conexión MCP revisada", args: "archivo.json" },\n  { name: "clave", description: "Ingresar la credencial local sin mostrarla", args: "id" },');
prepend(app,'import { integrationCommand, integrationRowIntent, type IntegrationIntent } from "./integration-view.js";');
patch(app,'const screens: Screen[] = [','const screens: Screen[] = [\n  "integrations",');
patch(app,'              message.operation\n                ? "Evidencia"','              message.operation === "integration" ? "Integraciones · catálogo y permisos" : message.operation\n                ? "Evidencia"');
patch(app,'  const command = (name: string, rest = "") => {',`  const applyIntegrationIntent = (intent: IntegrationIntent) => {
    if (intent.notice) notify(intent.notice);
    if (intent.composer !== undefined) { navigate("home"); setFocus("composer"); setComposer(intent.composer); }
    if (intent.phrase && intent.title && intent.body && intent.action) setConfirmation({ title: intent.title, body: intent.body, phrase: intent.phrase, action: intent.action });
    else if (intent.action) { mutate(intent.action); if (intent.action.type === "integration" && intent.action.action.command !== "login") navigate("integrations"); }
  };
  const command = (name: string, rest = "") => {`);
patch(app,'    name = canonicalCommand(name);','    name = canonicalCommand(name);\n    const integrationIntent = integrationCommand(name, rest, s);\n    if (integrationIntent) { setQuick(false); applyIntegrationIntent(integrationIntent); return; }');
patch(app,'  const activate = (row: Row) => {','  const activate = (row: Row) => {\n    if (screen === "integrations") { const intent = integrationRowIntent(row.id, s); if (intent) { applyIntegrationIntent(intent); return; } }');
// Newly pending writes are visible even if the user remains on the main activity screen.
patch(app,'  const paletteOpen = quick ||',`  const pendingIntegrationCount = s.integrations?.pending.filter(p => p.state === "pending").length ?? 0;
  const lastPendingCount = useRef(0);
  useEffect(() => {
    if (pendingIntegrationCount > lastPendingCount.current) notify("Hay una acción externa esperando tu permiso. Abrí /integraciones para revisar sus argumentos.");
    lastPendingCount.current = pendingIntegrationCount;
  }, [pendingIntegrationCount, notify]);
  const paletteOpen = quick ||`);
patch('src/i18n/es.ts','  goal: "objetivo",','  integrations: "integraciones",\n  browser: "navegador",\n  desktop: "escritorio",\n  goal: "objetivo",');
patch('src/i18n/es.ts','  home: "Inicio",','  integrations: "Integraciones",\n  home: "Inicio",');
prepend('src/cli/main.ts','import { registerIntegrations } from "./integrations.js";');
patch('src/cli/main.ts','  registerPrepare(program, context);','  registerIntegrations(program, globals);\n  registerPrepare(program, context);');
// Secrets are loaded into the exact connection, never the process-wide environment.
patch(wire,'    timeout = 30000,\n  ): Promise<McpConnection> {','    timeout = 30000,\n    credentials: Record<string, string> = {},\n  ): Promise<McpConnection> {');
patch(wire,'cleanEnvironment(directory, config.envRefs)','cleanEnvironment(directory, config.envRefs, { ...process.env, ...credentials })');
patch(wire,'? process.env[config.bearerEnv]','? credentials[config.bearerEnv] ?? process.env[config.bearerEnv]');
prepend(session,'import { transportCredentials } from "./credentials.js";');
patch(session,'        c.timeoutMs,\n      );','        c.timeoutMs,\n        await transportCredentials(this.home, c.kind === "github" ? githubTransport(c) : c.transport),\n      );');
patch(session,'      config.timeoutMs,\n    );','      config.timeoutMs,\n      await transportCredentials(home, config.kind === "github" ? githubTransport(config) : config.transport),\n    );');
patch(session,'      this.registry.claim(op.id, op.digest);','      if (remote) remote = await this.wire(this.record(server));\n      this.registry.claim(op.id, op.digest);');
// Resource-only MCP servers do not need an invented tools capability.
patch(wire,'    for (let page = 0; page < 20; page++) {','    for (let page = 0; page < 20 && this.client.getServerCapabilities()?.tools; page++) {');
// Native helper and encrypted credential storage are bundled only in Windows builds.
patch('scripts/prepare-desktop.ps1',"  @{backend='Microsoft WinApp CLI';",`  $vaultSource=(Resolve-Path 'src/windows/CredentialVault.cs').Path
  & $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out/Perfect.CredentialVault.exe" /reference:System.Security.dll $vaultSource
  if($LASTEXITCODE -ne 0){throw 'No se compiló el almacén cifrado de credenciales'}
  @{backend='Microsoft WinApp CLI';`);
patch('scripts/package-windows.ps1',"node scripts/build-brand.mjs","& (Join-Path $PSScriptRoot 'prepare-desktop.ps1')\nnode scripts/build-brand.mjs");
// Make test suites include the new integration folder without changing legacy test dispatch.
fs.appendFileSync('.gitignore','\nassets/windows/desktop/*.exe\nassets/windows/desktop/*.dll\nassets/windows/desktop/*LICENSE*\nassets/windows/desktop/provenance.json\n');
console.log('Interfaz y CLI conectadas; credenciales por transporte; catálogos revalidados tras aprobación.');
