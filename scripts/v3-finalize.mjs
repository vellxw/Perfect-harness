// Single-use, exact-anchor migration. The final commit contains its output, not this script.
import fs from 'node:fs';
import path from 'node:path';
const patch=(file,before,after)=>{const s=fs.readFileSync(file,'utf8');if(!s.includes(before))throw Error('Missing anchor '+file+': '+before.slice(0,120));fs.writeFileSync(file,s.replace(before,after));};
const prepend=(file,code)=>fs.writeFileSync(file,code+'\n'+fs.readFileSync(file,'utf8'));
const desktop='src/integrations/desktop/session.ts',wire='src/integrations/wire.ts',session='src/integrations/agent-session.ts';
prepend(desktop,'import { scopedWindowsArguments, literalDesktopCommand } from "./arguments.js";');
patch(desktop,'["ui", ...args, "-w", this.grant.handle, "--json"]','scopedWindowsArguments(this.grant.handle, args)');
patch(desktop,'command = ["set-value", element.selector, String(args.value)];','command = literalDesktopCommand("desktop_set_value", element.selector, String(args.value));');
patch(desktop,`command = [
        "send-keys",
        String(args.value),
        "--verbatim",
        "--target",
        element.selector,
        "--via",
        "send-input",
      ];`,'command = literalDesktopCommand("desktop_type", element.selector, String(args.value));');
patch('src/integrations/desktop/arguments.ts','/^[A-Za-z0-9_-]{1,200}$/','/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/');
prepend(wire,'import { integrationFailure } from "./errors.js";');
patch(wire,'    if (response.status >= 300 && response.status < 400) {',`    if ([401, 403, 429, 500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      throw integrationFailure({ status: response.status });
    }
    if (response.status >= 300 && response.status < 400) {`);
patch(wire,'      await connection.close();\n      throw error;','      await connection.close();\n      throw integrationFailure(error, signal);');
patch(wire,'  async catalog(signal: AbortSignal, timeout = 30000): Promise<Catalog> {',`  async catalog(signal: AbortSignal, timeout = 30000): Promise<Catalog> {
    try { return await this.readCatalog(signal, timeout); }
    catch (error) { throw integrationFailure(error, signal); }
  }
  private async readCatalog(signal: AbortSignal, timeout: number): Promise<Catalog> {`);
patch(wire,`    const result = await this.client.callTool(
      { name: tool.name, arguments: args },
      { signal, timeout },
    );` ,`    const result = await this.client.callTool(
      { name: tool.name, arguments: args },
      { signal, timeout },
    ).catch(error => { throw integrationFailure(error, signal); });`);
// Keep read-only resources bounded and auditable, not an unlimited side channel.
patch(session,'  async resources(server: string, cursor?: string): Promise<unknown> {','  private countRead(server: string): void {\n    const record = this.record(server), count = (this.calls.get(server) ?? 0) + 1;\n    this.calls.set(server, count);\n    if (count > record.config.maxCallsPerRun) throw new Blocked("MCP_CALL_LIMIT", "Límite de lecturas de integración agotado");\n  }\n  async resources(server: string, cursor?: string): Promise<unknown> {\n    this.countRead(server);');
patch(session,'  async readResource(server: string, uri: string): Promise<IntegrationResult> {','  async readResource(server: string, uri: string): Promise<IntegrationResult> {\n    this.countRead(server);');
patch(session,'    const result = await (\n      await this.wire(r)\n    ).readResource(uri, r.config.resourcePrefixes, this.signal);','    const started = performance.now();\n    const result = await (\n      await this.wire(r)\n    ).readResource(uri, r.config.resourcePrefixes, this.signal);\n    this.record(server);\n    await this.request.observeIntegration?.({server, tool: "resources/read", operationId: "resource-" + hash({uri, run:this.scope.runId}), argumentHash: hash({uri}), elapsedMs: performance.now() - started, response: result});');
patch(session,'    await Promise.allSettled([...this.browsers.values()].map((c) => c.close()));\n    await Promise.allSettled([...this.desktops.values()].map((c) => c.close()));',`    const cleanup = await Promise.allSettled([...this.browsers.values(), ...this.desktops.values()].map(c => c.close()));
    if (cleanup.some(result => result.status === "rejected")) {
      this.registry.event(this.scope.workspace, "integration.cleanup_pending", { runId: this.scope.runId, goalId: this.scope.goalId });
      this.request.event("integration.cleanup_pending", {runId:this.scope.runId, message:"Hay recursos nativos pendientes de reconciliar; no se declaró una limpieza correcta."});
    }`);
patch('src/integrations/pi-tools.ts','CATALOG|CREDENTIAL|REVOKED|CONFIG_CHANGED|OUTCOME_UNKNOWN|APPROVAL_TIMEOUT|PRIVACY|WINDOWS_REQUIRED|GRANT_|DESKTOP_STOPPED|DESKTOP_BUSY|BROWSER_DOCKER|DEPENDENCIES_REQUIRED','CATALOG|CREDENTIAL|AUTH_REQUIRED|RATE_LIMIT|CONNECTION_FAILED|REVOKED|CONFIG_CHANGED|OUTCOME_UNKNOWN|APPROVAL_TIMEOUT|PRIVACY|WINDOWS_REQUIRED|GRANT_|DESKTOP_STOPPED|DESKTOP_STOP_UNCONFIRMED|DESKTOP_BUSY|BROWSER_DOCKER|DEPENDENCIES_REQUIRED');
// Upgrade own version only: dependencies and historical source provenance are unchanged.
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const versionFiles=[...walk('src'),...walk('tests'),...walk('build/windows'),'scripts/smoke-windows.ps1','scripts/package-windows.ps1',...walk('docs/screenshots/es').filter(p=>p.endsWith('.txt'))];
for(const file of versionFiles.filter(p=>/\.(ts|tsx|cs|iss|ps1|txt)$/.test(p))){const old=fs.readFileSync(file,'utf8');if(old.includes('0.2.1'))fs.writeFileSync(file,old.replaceAll('0.2.1','0.3.0'));}
for(const file of ['package.json','package-lock.json']){const json=JSON.parse(fs.readFileSync(file,'utf8'));if(json.version!=='0.2.1')throw Error('Unexpected root version');json.version='0.3.0';if(json.packages?.[''])json.packages[''].version='0.3.0';fs.writeFileSync(file,JSON.stringify(json,null,2)+'\n');}
const readme='README.md';
patch(readme,'## Versión 0.2.1 · Español',`## Versión 0.3.0 · Integraciones en español

Cliente MCP por stdio y Streamable HTTP, servidor oficial de GitHub, navegador interactivo aislado y control temporal de una ventana Windows. Abrí **/integraciones** para conectar, revisar catálogos y aprobar operaciones externas. Las credenciales son locales; las escrituras requieren permiso exacto y el evaluador del núcleo mantiene la autoridad de DONE. [Guía completa de integraciones](docs/integraciones.md).

El navegador integrado explora la aplicación de la tarea dentro de Docker, no tu perfil de Chrome ni sitios externos. Windows se controla mediante una ventana autorizada, con UI Automation, comprobación de identidad, límites y parada global **Ctrl+Alt+F10**. No se exponen PowerShell, el registro, ventanas elevadas ni atajos del sistema. GitHub empieza en lectura, limitado a un repositorio.

### Interfaz en español`);
patch(readme,'La V2 está en `feat/perfect-harness-v2-tui-windows`.','La V3 está en `feat/perfect-harness-v3-integraciones`, basada en la V2 española sin fusionar sus solicitudes de cambios.');
patch(readme,'del flujo **Windows package**','del flujo **V3 Windows: paquete e instalación**');
patch(readme,'La versión 0.2.1 usa el instalador en español.','La versión 0.3.0 mantiene el instalador en español e incorpora el módulo nativo de escritorio.');
patch(readme,'git clone --branch feat/perfect-harness-v2-tui-windows','git clone --branch feat/perfect-harness-v3-integraciones');
patch(readme,'## Controles de la terminal',`## Conectar herramientas

\`\`\`text
/github propietario/repositorio
/navegador
/escritorio
/integraciones
\`\`\`

GitHub usa un token local con permisos mínimos; no hereda la cuenta conectada a ChatGPT. Probá la conexión, revisá el catálogo y autorizá su huella. Una conexión MCP local ejecuta un programa que vos revisaste: no es un sandbox del sistema operativo. [Permisos, ejemplos, credenciales y recuperación](docs/integraciones.md).

## Controles de la terminal`);
// Label old UI images as historical rather than falsifying their provenance.
patch(readme,'Esta imagen proviene del renderizador real','Esta captura histórica de la V2 española proviene del renderizador real');
console.log('Seguridad, cancelación, versión 0.3.0 y documentación actualizadas con anclas comprobadas.');
