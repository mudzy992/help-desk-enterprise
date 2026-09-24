import type { BadgeTone } from "@/components/ui/badge";
import {
  integrationJobStatuses,
  type IntegrationJobAdminStatus,
} from "@/services/integration-queue-types";

const tones: Record<IntegrationJobAdminStatus, BadgeTone> = {
  [integrationJobStatuses.pending]: "warning",
  [integrationJobStatuses.processing]: "primary",
  [integrationJobStatuses.completed]: "success",
  [integrationJobStatuses.failed]: "danger",
  [integrationJobStatuses.dlq]: "danger",
};

export function integrationJobBadgeTone(
  status: IntegrationJobAdminStatus,
): BadgeTone {
  return tones[status];
}
