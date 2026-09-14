import { z } from "zod";
import {
  ReasoningSchema,
  RoleSchema,
  VerificationSpecSchema,
} from "../domain/model.js";
import { BROWSER_IMAGE, NODE_IMAGE } from "./versions.js";
const AgentSchema = z
  .object({
    id: RoleSchema,
    provider: z.string(),
    accountRef: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    model: z.string(),
    reasoning: ReasoningSchema,
    auth: z.enum(["oauth", "api_key", "mock"]),
    billingMode: z.enum(["subscription", "free", "metered", "mock"]),
    capabilities: z.array(z.enum(["text", "image", "tools"])),
    readOnly: z.boolean(),
  })
  .strict();
export const ConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    agents: z.record(RoleSchema, AgentSchema),
    limits: z
      .object({
        maxGoalIterations: z.number().int().positive().default(10),
        maxTaskRetries: z.number().int().nonnegative().default(2),
        maxSameFailureRetries: z.number().int().nonnegative().default(1),
        maxPlannerCalls: z.number().int().positive().default(8),
        maxOracleCalls: z.number().int().positive().default(3),
        maxAgentTurns: z.number().int().positive().default(24),
        maxGoalProviderRequests: z.number().int().positive().default(200),
        timeoutPerTask: z
          .number()
          .int()
          .positive()
          .max(2_147_000_000)
          .default(1_200_000),
        timeoutPerGoal: z
          .number()
          .int()
          .positive()
          .max(2_147_000_000)
          .default(7_200_000),
        maxProviderRetries: z.number().int().nonnegative().default(2),
        maxNoProgressIterations: z.number().int().positive().default(2),
        contextTokens: z.number().int().positive().default(24000),
        maxOutputTokens: z.number().int().positive().default(12000),
        maxFileBytes: z.number().int().positive().default(2_000_000),
        maxWorkspaceBytes: z.number().int().positive().default(100_000_000),
      })
      .strict()
      .prefault({}),
    parallelism: z
      .object({
        maxParallelAgents: z.number().int().positive().default(4),
        maxParallelWriters: z.number().int().positive().default(2),
        maxParallelGeneralWorkers: z.number().int().positive().default(2),
        perAccount: z
          .record(z.string(), z.number().int().positive())
          .default({
            "xai-personal": 2,
            "chatgpt-personal": 1,
            "opencode-personal": 1,
          }),
        heavyCommands: z.number().int().positive().default(1),
      })
      .strict()
      .prefault({}),
    budgets: z
      .object({
        mode: z.enum(["off", "warn", "hard"]).default("warn"),
        maxTokens: z.number().positive().default(2_000_000),
        maxCostUsd: z.number().nonnegative().optional(),
        allowMetered: z.boolean().default(false),
      })
      .strict()
      .prefault({}),
    reviewPolicy: z
      .object({
        finalFeatureReview: z.boolean().default(true),
        visualReview: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    verificationPolicy: z
      .object({
        extraChecks: z.array(VerificationSpecSchema).default([]),
        requirePlanApproval: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    protectedPaths: z
      .array(z.string())
      .default([
        ".env",
        ".git",
        ".pi",
        ".perfect",
        ".ssh",
        ".github",
        "perfect.config.json",
        "auth.json",
        "credentials.json",
        "secrets",
        "references",
        "__snapshots__",
      ]),
    sandbox: z
      .object({
        image: z.string().default(NODE_IMAGE),
        browserImage: z.string().default(BROWSER_IMAGE),
        memoryMb: z.number().int().positive().default(2048),
        cpus: z.number().positive().default(2),
        pids: z.number().int().positive().default(256),
        network: z.literal("none").default("none"),
      })
      .strict()
      .prefault({}),
    permissions: z
      .object({
        allowApply: z.boolean().default(false),
        allowRemoteGit: z.literal(false).default(false),
        allowedExecutables: z
          .array(z.string())
          .default(["node", "npm", "npx", "python3", "git", "sh"]),
        researchHosts: z.array(z.string()).default([]),
      })
      .strict()
      .prefault({}),
  })
  .strict();
export type PerfectConfig = z.infer<typeof ConfigSchema>;
export function defaultConfig(): PerfectConfig {
  const grok = {
    provider: "xai",
    accountRef: "xai-personal",
    model: "grok-4.6",
    auth: "oauth",
    billingMode: "subscription",
    capabilities: ["text", "image", "tools"],
  } as const;
  const astra = {
    provider: "openai-codex",
    accountRef: "chatgpt-personal",
    model: "gpt-6-astra",
    auth: "oauth",
    billingMode: "subscription",
    capabilities: ["text", "image", "tools"],
  } as const;
  return ConfigSchema.parse({
    agents: {
      planner: { ...grok, id: "planner", reasoning: "xhigh", readOnly: true },
      general: { ...grok, id: "general", reasoning: "medium", readOnly: false },
      integrator: {
        ...grok,
        id: "integrator",
        reasoning: "medium",
        readOnly: false,
      },
      visual: { ...grok, id: "visual", reasoning: "medium", readOnly: true },
      frontend: {
        id: "frontend",
        provider: "opencode",
        accountRef: "opencode-personal",
        model: "muse-spark-1.3-contributor-free",
        auth: "api_key",
        billingMode: "free",
        reasoning: "xhigh",
        capabilities: ["text", "image", "tools"],
        readOnly: false,
      },
      backend: { ...astra, id: "backend", reasoning: "high", readOnly: false },
      oracle: { ...astra, id: "oracle", reasoning: "xhigh", readOnly: true },
    },
  });
}
