import { apiRequest } from "@/services/api";
import type { ProblemDetail } from "../problems-api";

/** BA-problems-17 keeps bounded lists honest; reminders are part of that contract. */
export type ProblemTargetReminderStatus =
  "PENDING" | "CLAIMED" | "SENT" | "NO_RECIPIENT" | "FAILED" | "DEAD" | "CANCELLED";

export type ProblemTargetReminder = {
  readonly id: string;
  readonly stage: string;
  readonly status: ProblemTargetReminderStatus;
  readonly targetAt: string;
  readonly attempts: number;
  readonly deliveredCount: number;
  readonly recipientCount: number;
  readonly errorCode: string | null;
  readonly nextAttemptAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly completedAt: string | null;
  readonly canRetry: boolean;
};

export type ProblemTargetReminders = {
  readonly items: readonly ProblemTargetReminder[];
  readonly canRetry: boolean;
};

export function getProblemTargetReminders(id: string): Promise<ProblemTargetReminders> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/target-reminders`);
}

export function retryProblemTargetReminder(
  id: string,
  reminderId: string,
): Promise<ProblemDetail & { readonly targetReminders: ProblemTargetReminders }> {
  return apiRequest(
    `/problems/${encodeURIComponent(id)}/target-reminders/${encodeURIComponent(reminderId)}/retry`,
    { method: "POST" },
  );
}
