import type {
  Evidence,
  Goal,
  Plan,
  Review,
  Task,
  VerificationResult,
} from "./model.js";
import { PlanProposalSchema, TaskSpecSchema } from "./model.js";
import { canonical, hash } from "./util.js";

export interface Judgment {
  done: boolean;
  reasons: string[];
}

/** A pure gate over controller-produced records. No model text can override this result. */
export function judge(input: {
  goal: Goal;
  plan: Plan;
  tasks: Task[];
  evidence: Evidence[];
  results: VerificationResult[];
  reviews: Review[];
  requiredReviews: ("oracle" | "visual")[];
  artifactsValid: boolean;
  routingValid: boolean;
  humanApprovedIds?: string[];
}): Judgment {
  const { goal, plan, tasks, evidence, results, reviews } = input;
  const reasons: string[] = [];
  if (!goal.candidateRevision) reasons.push("Missing candidate revision");
  if (goal.activePlanId !== plan.id || plan.goalId !== goal.id)
    reasons.push("Plan does not belong to the current goal");
  const parsed = PlanProposalSchema.strip().safeParse(plan);
  if (!parsed.success || hash(parsed.data) !== plan.hash)
    reasons.push("Plan fingerprint is invalid");
  if (canonical(goal.criteria) !== canonical(plan.criteria))
    reasons.push("Acceptance contract changed");
  if (!input.artifactsValid)
    reasons.push("Evidence artifacts missing or modified");
  if (!input.routingValid) reasons.push("Route integrity not verified");
  const activeIds = new Set(plan.tasks.map((spec) => spec.id));
  if (
    !activeIds.size ||
    activeIds.size !== plan.tasks.length ||
    new Set(tasks.map((t) => t.id)).size !== tasks.length ||
    tasks.some((t) => !activeIds.has(t.id) && t.status !== "superseded")
  )
    reasons.push("Task graph membership is inconsistent");
  for (const spec of plan.tasks) {
    const task = tasks.find((t) => t.id === spec.id);
    if (
      !task ||
      task.goalId !== goal.id ||
      task.planId !== plan.id ||
      task.status !== "accepted" ||
      !task.resultRevision ||
      canonical(TaskSpecSchema.strip().parse(task)) !== canonical(spec)
    ) {
      reasons.push(`Necessary task not accepted for this plan: ${spec.id}`);
      continue;
    }
    for (const dependency of spec.dependencies) {
      const producer = tasks.find((t) => t.id === dependency);
      if (
        !producer ||
        producer.status !== "accepted" ||
        task.dependencyOutputVersions[dependency] !== producer.resultRevision
      )
        reasons.push(`Stale dependency output: ${spec.id}/${dependency}`);
    }
  }
  const valid = evidence.filter(
    (e) =>
      e.validity === "valid" &&
      e.revision === goal.candidateRevision &&
      e.goalId === goal.id,
  );
  const provedCriteria = new Set<string>();
  for (const spec of plan.verification) {
    const result = results
      .filter(
        (r) =>
          r.goalId === goal.id &&
          r.specId === spec.id &&
          r.revision === goal.candidateRevision,
      )
      .at(-1);
    const proved =
      result &&
      result.status === "passed" &&
      result.exitCode === 0 &&
      result.evidenceIds.length > 0 &&
      result.evidenceIds.every((eid) =>
        valid.some(
          (e) =>
            e.id === eid &&
            e.producer === "runner" &&
            e.verificationId === result.id &&
            spec.criteriaIds.every((criterion) =>
              e.criteriaIds.includes(criterion),
            ),
        ),
      );
    if (proved)
      for (const criterion of spec.criteriaIds) provedCriteria.add(criterion);
    else if (spec.mandatory)
      reasons.push(`Verification not passed with current evidence: ${spec.id}`);
  }
  for (const criterion of plan.criteria.filter((c) => c.mandatory)) {
    if (criterion.kind === "human") {
      if (!input.humanApprovedIds?.includes(criterion.id))
        reasons.push(`Human approval required: ${criterion.id}`);
    } else if (!provedCriteria.has(criterion.id))
      reasons.push(`No passing runner evidence for: ${criterion.id}`);
  }
  for (const role of input.requiredReviews) {
    const review = reviews
      .filter(
        (r) =>
          r.role === role &&
          r.purpose === "acceptance" &&
          r.goalId === goal.id &&
          r.revision === goal.candidateRevision,
      )
      .at(-1);
    if (
      !review ||
      review.decision !== "approve" ||
      review.findings.some((f) => ["major", "critical"].includes(f.severity)) ||
      !review.evidenceIds.length ||
      review.evidenceIds.some(
        (eid) =>
          !valid.some(
            (e) =>
              e.id === eid &&
              e.producer === "reviewer" &&
              e.runId === review.runId,
          ),
      )
    )
      reasons.push(`Required review not approved: ${role}`);
  }
  return { done: reasons.length === 0, reasons };
}
