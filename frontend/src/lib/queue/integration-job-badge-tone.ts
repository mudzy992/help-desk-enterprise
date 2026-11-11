import type { BadgeTone } from "@/lib/ui/presentation-types";
import {
  integrationJobStatuses,
  type IntegrationJobAdminStatus,
} from "@/services/integration-queue-types";

const tones: Record<IntegrationJobAdminStatus, BadgeTone> = {
  [integrationJobStatuses.pending]: "warning",
  [integrationJobStatuses.processing]: "primary",
  [integrationJobStatuses.completed]: "success",
  [integrationJobStatuses.publishedBestEffort]: "info",
  [integrationJobStatuses.failed]: "danger",
  [integrationJobStatuses.dlq]: "danger",
};

export function integrationJobBadgeTone(status: IntegrationJobAdminStatus): BadgeTone {
  return tones[status];
}
