import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime,
  SessionManager, SettingsManager, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';

export const PI_VERSION = '0.85.1';
export type Reasoning = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface SessionOptions {
  cwd: string;
  controlDir: string;
  runtime: ModelRuntime;
  provider: string;
  model: string;
  reasoning: Reasoning;
  systemPrompt: string;
  tools: ToolDefinition[];
  persistent?: boolean;
}

/** Explicit inputs only: no project/global extensions, prompts, skills or model fallback. */
export async function openSession(options: SessionOptions) {
  const { runtime, provider, model: modelId, reasoning, controlDir, cwd } = options;
  const model = runtime.getModel(provider, modelId);
  if (!model) throw new Error(`MODEL_UNAVAILABLE: ${provider}/${modelId}`);
  await mkdir(controlDir, { recursive: true, mode: 0o700 });
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false }, retry: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: controlDir, agentDir: controlDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true,
    systemPromptOverride: () => options.systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await resourceLoader.reload();
  const result = await createAgentSession({
    cwd, agentDir: controlDir, modelRuntime: runtime, model,
    thinkingLevel: reasoning, noTools: 'builtin',
    tools: options.tools.map(t => t.name), customTools: options.tools,
    resourceLoader, settingsManager,
    sessionManager: options.persistent
      ? SessionManager.create(cwd, join(controlDir, 'sessions'))
      : SessionManager.inMemory(cwd),
  });
  const { session } = result;
  if (result.modelFallbackMessage || session.model?.id !== modelId ||
      session.model?.provider !== provider || session.thinkingLevel !== reasoning) {
    session.dispose();
    throw new Error('ROUTE_MISMATCH: Pi changed model/provider/reasoning');
  }
  return session;
}
