import { z } from 'zod';

export const Id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
export const ReasoningSchema = z.enum(['off','minimal','low','medium','high','xhigh','max']);
export type Reasoning = z.infer<typeof ReasoningSchema>;
export const RoleSchema = z.enum(['planner','general','frontend','backend','oracle','integrator','visual']);
export type Role = z.infer<typeof RoleSchema>;
export const States = ['RECEIVED','UNDERSTAND','DISCOVER','PLAN','DECOMPOSE','ASSIGN','EXECUTE','VERIFY','REVIEW','JUDGE','REPAIR','REPLAN','PAUSED','DONE','FAILED','ABORTED'] as const;
export type GoalState = typeof States[number];
export type Privacy = 'public' | 'private' | 'confidential';
export type Risk = 'low' | 'medium' | 'high' | 'critical';
export const CriterionSchema = z.object({id:Id,description:z.string().min(8),mandatory:z.boolean().default(true),kind:z.enum(['functional','visual','security','human']).default('functional')}).strict();
export type AcceptanceCriterion = z.infer<typeof CriterionSchema>;
export const CommandSchema = z.object({executable:z.string().min(1),args:z.array(z.string()).default([]),cwd:z.string().default('.'),timeoutMs:z.number().int().positive().max(1_200_000).default(120_000)}).strict();
export type CommandSpec = z.infer<typeof CommandSchema>;
const BrowserActionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('click'),selector:z.string()}),
  z.object({type:z.literal('fill'),selector:z.string(),value:z.string()}),
  z.object({type:z.literal('expectText'),selector:z.string(),value:z.string()}),
  z.object({type:z.literal('expectVisible'),selector:z.string()}),
]);
export const VisualScenarioSchema = z.object({
  path:z.string().default('/'),port:z.number().int().min(1024).max(65535).default(3000),server:CommandSchema,readyPath:z.string().default('/'),
  viewports:z.array(z.object({width:z.number().int().min(240).max(3840),height:z.number().int().min(240).max(2160)})).min(1).max(8),
  actions:z.array(BrowserActionSchema).default([]),targetFiles:z.array(z.string()).default([]),maxConsoleErrors:z.number().int().min(0).default(0),frames:z.array(z.number().int().nonnegative()).default([]),
}).strict();
export type VisualScenario = z.infer<typeof VisualScenarioSchema>;
export const VerificationSpecSchema = z.object({
  id:Id,title:z.string(),kind:z.enum(['command','browser','remotion']),criteriaIds:z.array(Id).min(1),mandatory:z.boolean().default(true),
  command:CommandSchema.optional(),scenario:VisualScenarioSchema.optional(),
  remotion:z.object({composition:z.string(),entry:z.string(),frames:z.array(z.number().int().nonnegative()).min(1),fps:z.number().positive(),durationFrames:z.number().int().positive(),width:z.number().positive(),height:z.number().positive()}).optional(),
}).strict().superRefine((s,ctx) => {
  if(s.kind==='command'&&!s.command)ctx.addIssue({code:'custom',message:'Command required'});
  if(s.kind==='browser'&&!s.scenario)ctx.addIssue({code:'custom',message:'Scenario required'});
  if(s.kind==='remotion'&&!s.remotion)ctx.addIssue({code:'custom',message:'Remotion specification required'});
});
export type VerificationSpec = z.infer<typeof VerificationSpecSchema>;
export const TaskSpecSchema = z.object({
  id:Id,title:z.string().min(3),description:z.string().min(10),type:z.enum(['discovery','general','frontend','backend','tests','documentation','integration','repair']),priority:z.number().int().min(0).max(100).default(50),
  riskLevel:z.enum(['low','medium','high','critical']).default('low'),privacyClass:z.enum(['public','private','confidential']).default('private'),dependencies:z.array(Id).default([]),assignedAgent:z.enum(['general','frontend','backend','integrator']),
  ownedFiles:z.array(z.string()).default([]),ownedSurfaces:z.array(z.string()).default([]),acceptanceCriteria:z.array(Id).min(1),verificationStrategy:z.array(Id).default([]),relevantFiles:z.array(z.string()).default([]),contracts:z.array(z.string()).default([]),
}).strict();
export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export const PlanProposalSchema = z.object({summary:z.string().min(10),assumptions:z.array(z.string()).default([]),architecture:z.array(z.string()).min(1),risks:z.array(z.string()).default([]),criteria:z.array(CriterionSchema).min(1),verification:z.array(VerificationSpecSchema).min(1),tasks:z.array(TaskSpecSchema).min(1).max(100)}).strict();
export type PlanProposal = z.infer<typeof PlanProposalSchema>;
export interface Plan extends PlanProposal {id:string;goalId:string;version:number;parentPlanId?:string;basedOnRevision:string;generatedByRunId:string;createdAt:string;hash:string}
export interface AgentDefinition {id:Role;provider:string;accountRef:string;model:string;reasoning:Reasoning;auth:'oauth'|'api_key'|'mock';billingMode:'subscription'|'free'|'metered'|'mock';capabilities:('text'|'image'|'tools')[];readOnly:boolean}
export interface RouteBinding extends AgentDefinition {runtimeVersion:string;capabilityHash:string;endpoint:string;requestedReasoning:Reasoning;selectedReasoning:Reasoning;resolvedAt:string;provenance:'catalog'|'mock'}
export interface Usage {
  id:string;goalId:string;runId:string;requestId?:string;provider:string;accountRef:string;modelRequested:string;modelSerialized?:string;modelReported?:string;reasoningRequested:Reasoning;reasoningSent?:string;reasoningReported?:string;
  inputTokens?:number;outputTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number;reasoningTokens?:number;totalTokens?:number;latencyMs:number;timeToFirstTokenMs?:number;retryCount:number;
  billingMode:AgentDefinition['billingMode'];estimatedCost?:number;reportedCharge?:number;completeness:'reported'|'partial'|'unknown';createdAt:string;
}
export interface AgentRun {id:string;goalId:string;taskId?:string;attempt:number;agentDefinitionId:Role;status:'running'|'completed'|'failed'|'interrupted';routeBinding:RouteBinding;contextPackageId:string;sessionRef?:string;inputRevision:string;outputRevision?:string;requestIds:string[];usageIds:string[];startedAt:string;endedAt?:string;stopReason?:string}
export interface ContextPackage {id:string;hash:string;goalId:string;taskId?:string;role:Role;goal:string;task?:TaskSpec;criteria:AcceptanceCriterion[];constraints:string[];files:{path:string;hash:string;content:string}[];manifest:string[];dependencyOutputs:{taskId:string;revision:string;summary:string}[];contracts:string[];failures:Failure[];evidence:Evidence[];allowedCommands:CommandSpec[];baseRevision:string;tokenEstimate:number;privacyClass:Privacy;createdAt:string}
export interface Evidence {id:string;goalId:string;taskId?:string;runId?:string;verificationId?:string;kind:'command'|'screenshot'|'frame'|'trace'|'review'|'diff'|'report'|'human';artifactRef:string;contentHash:string;producer:'runner'|'reviewer'|'controller'|'human';revision:string;environmentHash:string;criteriaIds:string[];capturedAt:string;validity:'valid'|'stale'|'rejected'}
export interface VerificationResult {id:string;goalId:string;taskId?:string;specId:string;revision:string;status:'passed'|'failed'|'skipped'|'error';command?:CommandSpec;exitCode?:number;evidenceIds:string[];startedAt:string;endedAt:string;failureIds:string[];summary:string}
export interface ReviewFinding {id:string;severity:'info'|'minor'|'major'|'critical';criterionId?:string;description:string;file?:string;region?:string;frame?:number}
export const ReviewSchema = z.object({decision:z.enum(['approve','request_changes','uncertain']),summary:z.string().min(5),findings:z.array(z.object({id:Id,severity:z.enum(['info','minor','major','critical']),criterionId:Id.optional(),description:z.string(),file:z.string().optional(),region:z.string().optional(),frame:z.number().optional()}).strict())}).strict();
export interface Review {id:string;goalId:string;runId:string;revision:string;role:'oracle'|'visual';decision:'approve'|'request_changes'|'uncertain';summary:string;findings:ReviewFinding[];evidenceIds:string[];createdAt:string}
export interface Failure {id:string;goalId:string;taskId?:string;lineageId:string;category:'implementation'|'contract'|'integration'|'environment'|'provider'|'verification'|'visual'|'policy'|'unknown';severity:'error'|'critical';signature:string;checkId?:string;normalizedError:string;evidenceIds:string[];occurrences:number;escalationLevel:number;createdAt:string;resolvedAt?:string}
export interface Task extends TaskSpec {goalId:string;planId:string;status:'pending'|'running'|'produced'|'accepted'|'failed'|'blocked'|'superseded';model:string;reasoning:Reasoning;resolvedRouteBinding?:RouteBinding;baseRevision:string;dependencyOutputVersions:Record<string,string>;worktreeRef?:string;attempt:number;maxAttempts:number;outputs:string[];evidence:string[];summary?:string;resultRevision?:string;failureReason?:string;repairsTaskId?:string;triggerFailureIds:string[];createdAt:string;updatedAt:string}
export interface Goal {id:string;schemaVersion:1;originalRequest:string;state:GoalState;workspaceId:string;source:string;root:string;baseline:string;sourceFingerprint:string;candidateRevision:string;activePlanId?:string;criteria:AcceptanceCriterion[];configSnapshot:unknown;configSnapshotHash:string;iteration:number;plannerCalls:number;oracleCalls:number;providerRequests:number;noProgress:number;activeMs:number;privacyClass:Privacy;mode:'real'|'mock';controlRequest?:'pause'|'abort';pauseReason?:string;terminalReason?:string;createdAt:string;updatedAt:string}
export interface FileOwnership {id:string;goalId:string;taskId:string;surfaces:string[];mode:'write';worktreeId:string;leaseEpoch:number;acquiredAt:string;expiresAt:string;releasedAt?:string;status:'held'|'released'}
export interface Event {id:string;sequence?:number;schemaVersion:1;type:string;goalId:string;taskId?:string;runId?:string;actor:string;correlationId:string;causationId?:string;occurredAt:string;payload:unknown}
export interface Approval {id:string;goalId:string;kind:'contributor'|'plan'|'human'|'apply'|'network';scopeHash:string;approvedAt:string;actor:'user'}
export interface OperationIntent {id:string;goalId:string;taskId?:string;kind:'container'|'integration'|'apply';status:'started'|'completed'|'uncertain';resource:string;beforeRevision:string;afterRevision?:string;createdAt:string}
export interface Attempt {id:string;goalId:string;taskId:string;number:number;runId:string;status:'running'|'completed'|'failed'|'interrupted';startedAt:string;endedAt?:string;failureId?:string}
