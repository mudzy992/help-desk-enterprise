import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { assetViewerFromContext, viewerHasPermission } from '../assets/asset-viewer';
import { TicketConfidentialConfigurationLoader } from '../tickets/confidential/ticket-confidential-configuration.loader';
import { buildTicketSurfaceVisibility } from '../tickets/list/build-ticket-surface-visibility';
import { loadTicketVisibilityInputs } from '../tickets/list/load-ticket-visibility-inputs';
import type { SettingsService } from '../settings/settings.service';
import { problemPrincipalScope } from '../problems/problem-principal-scope';

export type ProblemReportVisibility = { readonly problem: Prisma.ProblemWhereInput; readonly ticket: Prisma.TicketWhereInput };

/** No principal/permission means no problem report, not a report with an unfiltered population. */
export async function problemReportVisibility(prisma: PrismaService, settings: SettingsService, userId: string): Promise<ProblemReportVisibility | null> {
  const [problem, principal] = await Promise.all([problemPrincipalScope(prisma, userId), loadPrincipalContext(prisma, userId)]);
  if (principal === null || !principal.isActive || !viewerHasPermission(assetViewerFromContext(principal, userId, 'problem.'), permissionKeys.problemRead)) return null;
  const context = createAuthorizationContext({
    id: principal.subjectId, isActive: principal.isActive, isLocalOnly: principal.isLocalOnly,
    entraObjectId: principal.entraObjectId, directoryObjectGuid: principal.directoryObjectGuid ?? null, assignments: principal.assignments,
  });
  if (context === null) return null;
  const configuration = await new TicketConfidentialConfigurationLoader(settings).load();
  const inputs = await loadTicketVisibilityInputs(prisma, userId, { includeActorGroupIds: configuration.enabled && configuration.allowedViewerGroupIds.length > 0 });
  return {
    problem: problem ?? {},
    ticket: buildTicketSurfaceVisibility({ surface: 'list', visibility: { context, ...inputs, actorMembershipUserId: userId, configuration, now: new Date() } })!,
  };
}
