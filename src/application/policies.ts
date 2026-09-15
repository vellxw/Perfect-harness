import type { Failure, PlanProposal, Task } from "../domain/model.js";
import { hash } from "../domain/util.js";
export function failureSignature(
  check: string,
  message: string,
): { signature: string; normalized: string } {
  const normalized = message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z\b/g, "<time>")
    .replace(/(duration_ms[\s:\"=]+)[\d.]+/g, "$1<duration>")
    .replace(/\([\d.]+\s*ms\)/g, "(<duration>ms)")
    .replace(/(worktrees\/)[a-zA-Z0-9_-]+\//g, "$1<attempt>/")
    .replace(/localhost:\d+|127\.0\.0\.1:\d+/g, "localhost:<port>")
    .replace(/perfect-[a-z-]+[0-9a-f-]{12,}/g, "<workspace>")
    .trim();
  return { signature: hash([check, normalized]), normalized };
}
export function escalation(
  occurrences: number,
  critical: boolean,
  maxSameFailureRetries: number,
): "worker" | "planner" | "oracle" {
  if (critical || occurrences > maxSameFailureRetries + 2) return "oracle";
  return occurrences > maxSameFailureRetries ? "planner" : "worker";
}
export function needsOracle(
  plan: PlanProposal,
  tasks: Task[],
  finalFeatureReview = true,
): boolean {
  const critical =
    /\b(auth|authorization|authentication|payments?|webhooks?|migrations?|concurrency|transactions?|integrity|autorizaci[oó]n|autenticaci[oó]n|pagos?|migraci[oó]n|concurrencia|integridad)\b/i;
  return (
    finalFeatureReview ||
    tasks.some((t) => ["high", "critical"].includes(t.riskLevel)) ||
    critical.test(
      [plan.summary, ...plan.risks, ...tasks.map((t) => t.description)].join(
        " ",
      ),
    )
  );
}
export function classifyFailure(message: string): Failure["category"] {
  // Test output often includes HTTP codes, words like "auth", and UUIDs.
  // Those are not evidence that the inference provider failed.
  if (/\b(?:AssertionError|ERR_ASSERTION)\b/.test(message))
    return "implementation";
  if (
    /\b(?:AUTH_REQUIRED|AUTH_ROUTE_MISMATCH|AUTH_FAILED|MODEL_UNAVAILABLE|REASONING_[A-Z_]+|ROUTE_[A-Z_]+|PROVIDER_FAILED|insufficient_quota)\b/.test(
      message,
    ) ||
    /(?:HTTP(?:Error)?[ :]+|status(?: code)?[ :=]+)(?:401|403|429)\b|\bquota (?:exceeded|exhausted)\b|\brate[ -]?limit(?:ed| exceeded)\b/i.test(
      message,
    )
  )
    return "provider";
  if (
    /\bSANDBOX_[A-Z_]+\b|\bDocker (?:daemon|is unavailable)|Cannot connect to the Docker daemon|spawn \S+ ENOENT|net::ERR_(?:SSL_PROTOCOL_ERROR|NAME_NOT_RESOLVED|PROXY_CONNECTION_FAILED)|Runtime did not become healthy/i.test(
      message,
    )
  )
    return "environment";
  if (
    /\b(?:[A-Z_]*DENIED|PROTECTED_[A-Z_]+|OWNERSHIP_[A-Z_]+|PRIVACY_[A-Z_]+|[A-Z_]*APPROVAL|BUDGET_[A-Z_]+)\b/.test(
      message,
    )
  )
    return "policy";
  if (/visual|screenshot|overflow|console error/i.test(message))
    return "visual";
  if (/INTEGRATION_CONFLICT|merge conflict|integration conflict/i.test(message))
    return "integration";
  return "implementation";
}
