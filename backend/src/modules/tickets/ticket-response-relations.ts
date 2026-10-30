import type { Prisma } from '../../generated/prisma/client';
import type { CloseCodeRecord } from './close-codes/close-codes.types';
import type { TicketCsatRecord } from './csat/csat.types';
import type { TicketSlaStateRecord } from '../sla/ticket-sla.types';
import type { TicketRecord } from './tickets.types';

/**
 * Relations needed to render a ticket response. Callers use Prisma's `join`
 * relation strategy so the ticket row and its display/hydration data arrive in
 * one SQL round trip instead of follow-up batch queries.
 */
export const ticketResponseRelations = {
  requester: { select: { id: true, displayName: true } },
  assignedUser: { select: { id: true, displayName: true } },
  assignedGroup: { select: { id: true, name: true } },
  formVersion: { select: { id: true, version: true } },
  originUnit: { select: { id: true, name: true, ouPath: true } },
  service: { select: { id: true, name: true } },
  parentTicket: {
    select: { id: true, ticketNumber: true, title: true, isConfidential: true },
  },
  mergedInto: {
    select: { id: true, ticketNumber: true, title: true, isConfidential: true },
  },
  closeCode: { select: { id: true, key: true, name: true } },
  slaState: {
    select: {
      ticketId: true,
      slaProfileId: true,
      startedAt: true,
      responseDueAt: true,
      resolutionDueAt: true,
      respondedAt: true,
      resolutionCompletedAt: true,
      pausedAt: true,
      isResponseBreached: true,
      isResolutionBreached: true,
      isResponseAtRisk: true,
      isResolutionAtRisk: true,
    },
  },
  csat: {
    select: {
      id: true,
      ticketId: true,
      rating: true,
      comment: true,
      submittedByUserId: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.TicketInclude;

type TicketResponseCloseCode = Pick<CloseCodeRecord, 'id' | 'key' | 'name'>;
type TicketResponseSlaState = Pick<
  TicketSlaStateRecord,
  | 'ticketId'
  | 'slaProfileId'
  | 'startedAt'
  | 'responseDueAt'
  | 'resolutionDueAt'
  | 'respondedAt'
  | 'resolutionCompletedAt'
  | 'pausedAt'
  | 'isResponseBreached'
  | 'isResolutionBreached'
  | 'isResponseAtRisk'
  | 'isResolutionAtRisk'
>;
type TicketResponseParent = Pick<
  TicketRecord,
  'id' | 'ticketNumber' | 'title' | 'isConfidential'
>;

/** The runtime shape returned by `ticketResponseRelations` on a joined read. */
export type TicketResponseJoinedRecord = TicketRecord & {
  readonly requester: { readonly id: string; readonly displayName: string } | null;
  readonly assignedUser: { readonly id: string; readonly displayName: string } | null;
  readonly assignedGroup: { readonly id: string; readonly name: string } | null;
  readonly formVersion: { readonly id: string; readonly version: number } | null;
  readonly originUnit: {
    readonly id: string;
    readonly name: string;
    readonly ouPath: string;
  } | null;
  readonly service: { readonly id: string; readonly name: string } | null;
  readonly parentTicket: TicketResponseParent | null;
  readonly mergedInto: TicketResponseParent | null;
  readonly closeCode: TicketResponseCloseCode | null;
  readonly slaState: TicketResponseSlaState | null;
  readonly csat: TicketCsatRecord | null;
};

export function hasTicketResponseRelations(
  records: readonly TicketRecord[],
): records is readonly TicketResponseJoinedRecord[] {
  const relationNames = [
    'requester',
    'assignedUser',
    'assignedGroup',
    'formVersion',
    'originUnit',
    'service',
    'parentTicket',
    'mergedInto',
    'closeCode',
    'slaState',
    'csat',
  ] as const;
  return records.every((record) =>
    relationNames.every((relation) =>
      Object.prototype.hasOwnProperty.call(record, relation),
    ),
  );
}
