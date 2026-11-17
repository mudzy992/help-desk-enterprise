/**
 * W7.28 (BA-problems-10): a problem group change is a recorded handoff, not a
 * field update. These calls only reflect what the server decides; the server
 * enforces the target-group authority, the acceptance and the unit tree.
 */

import { apiRequest } from "@/services/api";

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
import type { ProblemDetail } from "./problems-api";

type UserRef = { readonly id: string; readonly displayName: string; readonly email?: string };

/** W7.28: a group transfer, from the request to the decision. */
export type ProblemHandoffStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

export type ProblemHandoffSummary = {
  readonly id: string;
  readonly status: ProblemHandoffStatus;
  readonly reason: string;
  readonly createdAt: string;
  readonly requestedBy: UserRef | null;
  readonly toGroup: { readonly id: string; readonly name: string };
  readonly toOrganizationalUnit: { readonly id: string; readonly name: string };
};

export type ProblemHandoff = ProblemHandoffSummary & {
  readonly problemId: string;
  readonly decisionReason: string | null;
  readonly fromGroup: { readonly id: string; readonly name: string } | null;
  readonly fromOrganizationalUnit: { readonly id: string; readonly name: string };
  readonly decidedBy: UserRef | null;
  readonly decidedAt: string | null;
};

export type ProblemHandoffResult = {
  readonly handoff: ProblemHandoff;
  readonly problem: ProblemDetail;
};

export function getProblemHandoffs(
  id: string,
): Promise<{ readonly items: readonly ProblemHandoff[] }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/handoffs`);
}

/**
 * W7.28 (BA-problems-10): a group change is this command, never a field update.
 * Running the target group makes it immediate; otherwise it waits as PENDING.
 */
export function requestProblemHandoff(
  id: string,
  input: { readonly toGroupId: string; readonly reason: string },
): Promise<ProblemHandoffResult> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/handoffs`, {
    method: "POST",
    ...json(input),
  });
}

export function acceptProblemHandoff(id: string, handoffId: string): Promise<ProblemHandoffResult> {
  return apiRequest(
    `/problems/${encodeURIComponent(id)}/handoffs/${encodeURIComponent(handoffId)}/accept`,
    {
      method: "POST",
      ...json({}),
    },
  );
}

export function rejectProblemHandoff(
  id: string,
  handoffId: string,
  input: { readonly reason: string },
): Promise<ProblemHandoffResult> {
  return apiRequest(
    `/problems/${encodeURIComponent(id)}/handoffs/${encodeURIComponent(handoffId)}/reject`,
    {
      method: "POST",
      ...json(input),
    },
  );
}

export function cancelProblemHandoff(id: string, handoffId: string): Promise<ProblemHandoffResult> {
  return apiRequest(
    `/problems/${encodeURIComponent(id)}/handoffs/${encodeURIComponent(handoffId)}/cancel`,
    {
      method: "POST",
      ...json({}),
    },
  );
}
