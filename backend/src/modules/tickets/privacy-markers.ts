import type { AuthorizationContext } from '../authorization/authorization.types';
import { permissionKeys } from '../authorization/authorization.constants';
import type { TicketRecord } from './tickets.types';

/**
 * Paket 2.6 (§11): privacy markers on the ticket detail. A legal hold may
 * reveal an ongoing investigation, so only holders of `privacy.view` (ADMIN,
 * SUPER_ADMIN) see it; "attachments removed by retention" is shown to
 * everyone who can see the ticket, because it explains a missing file.
 */
export type TicketPrivacyMarkers = {
  readonly legalHold: boolean;
  readonly attachmentsPurgedAt: string | null;
};

export function canSeeLegalHold(context: AuthorizationContext | null): boolean {
  if (context === null) return false;
  return (
    context.isSuperAdmin ||
    context.assignments.some((assignment) => assignment.permissionKeys.includes(permissionKeys.privacyView))
  );
}

export function ticketPrivacyMarkers(record: TicketRecord, showLegalHold: boolean): TicketPrivacyMarkers {
  return {
    legalHold: showLegalHold && record.legalHoldAt !== null && record.legalHoldAt !== undefined,
    attachmentsPurgedAt: record.attachmentsPurgedAt?.toISOString() ?? null,
  };
}
