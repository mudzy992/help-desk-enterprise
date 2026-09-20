import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { isTicketStaff } from "@/lib/session/route-access";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";

export type KnowledgeCapabilities = {
  readonly isSuperAdmin: boolean;
  readonly canWrite: boolean;
  readonly canManageLifecycle: boolean;
};

/**
 * Editing, reviewing, publishing and archiving articles belong to staff. A
 * knowledge permission alone is not enough: requesters only read published
 * articles, so the management actions are hidden from them even if their role
 * has been granted a knowledge permission.
 */
export function resolveKnowledgeCapabilities(
  capabilities: SessionCapabilities,
): KnowledgeCapabilities {
  const isSuperAdmin =
    capabilities.session?.isSuperAdmin === true ||
    capabilities.hasRole(roleKeys.superAdmin);
  const isStaff = isTicketStaff(capabilities);
  return {
    isSuperAdmin,
    canWrite: isStaff && capabilities.hasPermission(permissionKeys.knowledgeArticleWrite),
    canManageLifecycle:
      isStaff &&
      (capabilities.hasPermission(permissionKeys.knowledgeArticleReview) ||
        capabilities.hasPermission(permissionKeys.knowledgeArticlePublish)),
  };
}
