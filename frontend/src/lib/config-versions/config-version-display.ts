import type { BadgeTone } from "@/components/ui/badge";
import {
  configVersionStatuses,
  type ConfigVersion,
  type ConfigVersionStatus,
} from "@/services/config-versions-types";

const tones: Record<ConfigVersionStatus, BadgeTone> = {
  [configVersionStatuses.draft]: "neutral",
  [configVersionStatuses.validated]: "info",
  [configVersionStatuses.shadow]: "warning",
  [configVersionStatuses.active]: "success",
  [configVersionStatuses.rolledBack]: "neutral",
};

export function configVersionBadgeTone(status: ConfigVersionStatus): BadgeTone {
  return tones[status];
}

export function filterConfigVersions(
  versions: readonly ConfigVersion[],
  status: ConfigVersionStatus | "ALL",
): readonly ConfigVersion[] {
  if (status === "ALL") {
    return versions;
  }
  return versions.filter((version) => version.status === status);
}

export function formatConfigDiffChange(input: {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}): string {
  return `${input.path}: ${stringifyDiffValue(input.before)} → ${stringifyDiffValue(input.after)}`;
}

export function stringifyDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
