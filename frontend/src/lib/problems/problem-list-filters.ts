import { problemOpenStatuses, problemStatuses, type ProblemStatus } from "@/services/problems-api";

export type ProblemStatusFilter = "open" | "all" | ProblemStatus;

export function problemStatusesOf(
  filter: ProblemStatusFilter,
): readonly ProblemStatus[] | undefined {
  if (filter === "all") return undefined;
  if (filter === "open") return problemOpenStatuses;
  return [filter];
}

export function parseProblemStatusFilter(raw: string | null): ProblemStatusFilter {
  if (raw === "all") return "all";
  return raw !== null && (problemStatuses as readonly string[]).includes(raw)
    ? (raw as ProblemStatus)
    : "open";
}
