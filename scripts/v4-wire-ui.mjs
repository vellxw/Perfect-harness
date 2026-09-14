import fs from 'node:fs';
const change=(path,old,next)=>{const text=fs.readFileSync(path,'utf8');if(text.split(old).length!==2)throw Error('Anchor not unique: '+path+' '+old.slice(0,100));fs.writeFileSync(path,text.replace(old,next));};
const prepend=(path,text)=>fs.writeFileSync(path,text+fs.readFileSync(path,'utf8'));
// An abort may initiate SDK shutdown before finally calls close. Await the SAME close promise.
change('src/integrations/wire.ts','  private abort?: () => void;','  private closing?: Promise<void>;\n  private abort?: () => void;');
change('src/integrations/wire.ts','        void connection.client.close().catch(() => {});','        void connection.close().catch(() => {});');
change('src/integrations/wire.ts','    await this.client.close().catch(() => {});','    this.closing ??= this.client.close().catch(() => {});\n    await this.closing;');
// Never turn unknown rights into an authorization merely because the user asks for local-only storage.
change('src/skills/remote.ts','redistribution: transitions || input.localOnly ? "local-only" : license === "unknown" ? "unknown" : "allowed"','redistribution: license === "unknown" ? "unknown" : transitions || input.localOnly ? "local-only" : "allowed"');
change('src/ui/tui/studio-view.ts','No autoriza scripts ni demuestra calidad de inferencia.\",\"APROBAR\")','No autoriza scripts ni demuestra calidad de inferencia.`,\"APROBAR\")');
// Domain preference remains independent from skills; explicit work mode per new goal is a snapshot, not a mutation of old runs.
change('src/skills/registry.ts','    base: PerfectConfig,\n  ): StudioSnapshot {','    base: PerfectConfig,\n    modeOverride?: string,\n  ): StudioSnapshot {');
change('src/skills/registry.ts','    const result: StudioSnapshot = {','    const selectedConfig = structuredClone(record.config);\n    if (modeOverride) selectedConfig.activeMode = modeOverride;\n    StudioConfigSchema.parse(selectedConfig);\n    const result: StudioSnapshot = {');
change('src/skills/registry.ts','      config: structuredClone(record.config),\n      hash: record.hash,','      config: selectedConfig,\n      hash: hash(selectedConfig),');
change('src/application/goals.ts','    mode?: "real" | "mock";','    mode?: "real" | "mock";\n    workMode?: string;');
change('src/application/goals.ts','      input.config,\n    ).id;','      input.config,\n      input.workMode,\n    ).id;');
// No admin models or full libraries in agent context; this projection is for the local user UI only.
prepend('src/presentation/protocol.ts','import { StudioActionSchema } from "../skills/actions.js";\nimport type { StudioPanelSnapshot } from "../skills/admin.js";\n');
change('src/presentation/protocol.ts','export type Screen =','export type Screen =\n  | "skills" | "teams" | "profiles" | "modes" | "skill-detail" | "team-detail" | "profile-detail"');
change('src/presentation/protocol.ts','export interface UiSnapshot {','export interface UiSnapshot {\n  studio?: StudioPanelSnapshot;');
change('src/presentation/protocol.ts','export const UiActionSchema = z.discriminatedUnion("type", [','export const UiActionSchema = z.discriminatedUnion("type", [\n  z.object({ type: z.literal("studio"), action: StudioActionSchema }).strict(),\n  z.object({ type: z.literal("create-skill"), description: z.string().trim().min(8).max(20000) }).strict(),');
prepend('src/presentation/engine.ts','import { StudioAdmin } from "../skills/admin.js";\nimport { studioId } from "../skills/registry.js";\nimport { defaultConfig } from "../config/schema.js";\n');
change('src/presentation/engine.ts','  readonly integrations: IntegrationAdmin;','  readonly integrations: IntegrationAdmin;\n  readonly studios: StudioAdmin;');
change('src/presentation/engine.ts','    this.integrations = new IntegrationAdmin(home);','    this.integrations = new IntegrationAdmin(home);\n    this.studios = new StudioAdmin(this.store, home);');
change('src/presentation/engine.ts','    const serialized = JSON.stringify(state);','    if (this.store.get("studios", studioId(this.workspace))) state.studio = this.studios.panel(this.workspace, defaultConfig());\n    const serialized = JSON.stringify(state);');
change('src/presentation/engine.ts','      switch (action.type) {','      switch (action.type) {\n        case "studio": {\n          const result = await this.studios.perform(this.workspace, await ctx.config(), action.action);\n          message = result.message;\n          content = action.action.command === "status" ? undefined : result.content;\n          path = result.path;\n          operation = "studio";\n          break;\n        }\n        case "create-skill": {\n          this.idle();\n          const goal = await createGoal({request: "Crear un borrador de habilidad con SKILL.md, recursos pertinentes y casos de selección positivos/negativos separados en desarrollo y reservados. No autoaprobar ni activar. Necesidad del usuario: " + action.description, source: this.workspace, home: this.home, config: await ctx.config(), privacy: "private", workMode: "skill-studio"}, this.store);\n          this.start(goal);\n          message = "Creador iniciado como goal privada; requiere proveedores configurados y aprobación independiente del borrador.";\n          break;\n        }');
prepend('src/cli/main.ts','import { registerSkills } from "./skills.js";\n');
change('src/cli/main.ts','  registerIntegrations(program, globals);','  registerSkills(program, context);\n  registerIntegrations(program, globals);');
// UI views remain a thin layer around validated actions.
prepend('src/ui/tui/views.ts','import { studioRows, studioScreens } from "./studio-view.js";\n');
change('src/ui/tui/views.ts','export function viewRows(s: UiSnapshot, screen: Screen): Row[] {','export function viewRows(s: UiSnapshot, screen: Screen, subject = ""): Row[] {\n  if ((studioScreens as readonly string[]).includes(screen)) return studioRows(s, screen, subject);');
change('src/ui/tui/views.ts','export const commands: PaletteItem[] = [','export const commands: PaletteItem[] = [\n  { name: "skills", description: "Activar, desactivar y asignar habilidades por equipo" },\n  { name: "teams", description: "Equipos y pertenencia de perfiles" },\n  { name: "profiles", description: "Elegir modelo, cuenta y conocimientos de cada perfil" },\n  { name: "modes", description: "Aplicaciones, Motion Studio y Game Creator" },\n  { name: "juegos", description: "Seleccionar Game Creator" },\n  { name: "motion", description: "Seleccionar Motion Studio" },\n  { name: "crear-skill", description: "Crear un borrador de habilidad y sus pruebas", args: "descripción y equipo" },\n  { name: "equipo", description: "Crear o renombrar equipo", args: "id Nombre del equipo" },\n  { name: "adoptar-perfiles", description: "Reiniciar una goal en pausa con ajustes actuales" },');
prepend('src/ui/tui/app.tsx','import { studioScreens, studioCommand, studioRowIntent, type StudioIntent } from "./studio-view.js";\nimport { BindingForm } from "./binding-form.js";\n');
change('src/ui/tui/app.tsx','const screens: Screen[] = [','const screens: Screen[] = [\n  ...studioScreens,');
change('src/ui/tui/app.tsx','  const [screen, setScreen] = useState<Screen>(initialScreen);','  const [screen, setScreen] = useState<Screen>(initialScreen);\n  const [studioSubject, setStudioSubject] = useState("");\n  const [bindingProfile, setBindingProfile] = useState<string>();');
change('src/ui/tui/app.tsx','viewRows(s, screen), [s, screen]','viewRows(s, screen, studioSubject), [s, screen, studioSubject]');
change('src/ui/tui/app.tsx','    const integrationIntent = integrationCommand(name, rest, s);','    const skillIntent = studioCommand(name, rest, s);\n    if (skillIntent) { applyStudioIntent(skillIntent); return; }\n    const integrationIntent = integrationCommand(name, rest, s);');
change('src/ui/tui/app.tsx','  const command = (name: string, rest = "") => {',`  const applyStudioIntent = (intent: StudioIntent) => {
    if (intent.subject !== undefined) setStudioSubject(intent.subject);
    if (intent.screen) navigate(intent.screen);
    if (intent.editProfile) setBindingProfile(intent.editProfile);
    if (intent.notice) notify(intent.notice);
    if (intent.composer !== undefined) { navigate("home"); setFocus("composer"); setComposer(intent.composer); }
    if (intent.phrase && intent.title && intent.body && intent.action) setConfirmation({title:intent.title,body:intent.body,phrase:intent.phrase,action:intent.action});
    else if (intent.action) mutate(intent.action);
  };
  const command = (name: string, rest = "") => {`);
change('src/ui/tui/app.tsx','  const activate = (row: Row | undefined) => {','  const activate = (row: Row | undefined) => {\n    if (row && (studioScreens as readonly string[]).includes(screen)) { const intent=studioRowIntent(s,screen,studioSubject,row.id); if(intent){applyStudioIntent(intent);return;} }');
change('src/ui/tui/app.tsx','    if (confirmation) return;','    if (confirmation || bindingProfile) return;');
change('src/ui/tui/app.tsx','      {confirmation && (',`      {bindingProfile && s.studio?.config.profiles.find(p=>p.id===bindingProfile) && (
        <BindingForm profile={s.studio.config.profiles.find(p=>p.id===bindingProfile)!} width={width} height={height} motion={motion}
          onCancel={()=>setBindingProfile(undefined)}
          onSave={binding=>{const profileId=bindingProfile;setBindingProfile(undefined);setConfirmation({title:"Cambiar modelo del perfil",phrase:"CAMBIAR",body:JSON.stringify(binding,null,2)+"\\n\\nNo cambia equipos ni permisos. Las sesiones antiguas conservan su binding. Se valida compatibilidad antes de guardar, autenticación antes de inferir.",action:{type:"studio",action:{command:"binding",profileId,binding,expectedHash:s.studio!.hash,confirmation:"CAMBIAR"}}});}} />
      )}
      {confirmation && (`);
// Explicit metadata stays in its original language; product labels remain Spanish.
change('src/i18n/es.ts','export const commandNames: Readonly<Record<string, string>> = {','export const commandNames: Readonly<Record<string, string>> = {\n  skills: "habilidades", teams: "equipos", profiles: "perfiles", modes: "modos",');
change('src/i18n/es.ts','const screenNames: Readonly<Record<string, string>> = {','const screenNames: Readonly<Record<string, string>> = {\n  skills: "Habilidades", teams: "Equipos", profiles: "Perfiles y modelos", modes: "Modos de trabajo", "skill-detail":"Habilidad y ámbitos", "team-detail":"Equipo y miembros", "profile-detail":"Perfil y modelo",');
console.log('Wired user-facing studio actions without giving agents administrative tools.');
