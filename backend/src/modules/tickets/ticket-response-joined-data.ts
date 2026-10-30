import type { CloseCodeDescriptor } from './close-codes/close-codes.types';
import type { TicketCsatRecord } from './csat/csat.types';
import type { TicketDisplayLabels } from './load-ticket-display-labels';
import type { ParentTicketSummary } from './load-parent-ticket-summaries';
import { toTicketSlaClientSnapshot } from './load-ticket-sla-snapshots';
import type { TicketSlaClientSnapshot } from './tickets.types';
import type { TicketResponseJoinedRecord } from './ticket-response-relations';

export type TicketResponseJoinedData = {
  readonly closeCodes: ReadonlyMap<string, CloseCodeDescriptor>;
  readonly sla: ReadonlyMap<string, TicketSlaClientSnapshot>;
  readonly csat: ReadonlyMap<string, TicketCsatRecord>;
  readonly parents: ReadonlyMap<string, ParentTicketSummary>;
  readonly labels: TicketDisplayLabels;
};

/**
 * Shapes the relations already returned by a `relationLoadStrategy: 'join'`
 * ticket query into the same maps the old batch loaders produced. Keeping the
 * response mapper on these existing contracts preserves confidentiality and
 * null behavior while avoiding follow-up database reads.
 */
export function mapTicketResponseJoinedData(
  records: readonly TicketResponseJoinedRecord[],
  withCsat: boolean,
): TicketResponseJoinedData {
  const closeCodes = new Map<string, CloseCodeDescriptor>();
  const sla = new Map<string, TicketSlaClientSnapshot>();
  const csat = new Map<string, TicketCsatRecord>();
  const parents = new Map<string, ParentTicketSummary>();
  const users = new Map<string, string>();
  const groups = new Map<string, string>();
  const formVersions = new Map<string, number>();
  const originUnits = new Map<string, { readonly name: string; readonly path: string }>();
  const services = new Map<string, string>();

  for (const record of records) {
    if (record.requester !== null) {
      users.set(record.requester.id, record.requester.displayName);
    }
    if (record.assignedUser !== null) {
      users.set(record.assignedUser.id, record.assignedUser.displayName);
    }
    if (record.assignedGroup !== null) {
      groups.set(record.assignedGroup.id, record.assignedGroup.name);
    }
    if (record.formVersion !== null) {
      formVersions.set(record.formVersion.id, record.formVersion.version);
    }
    if (record.originUnit !== null) {
      originUnits.set(record.originUnit.id, {
        name: record.originUnit.name,
        path: record.originUnit.ouPath,
      });
    }
    if (record.service !== null) {
      services.set(record.service.id, record.service.name);
    }
    if (record.closeCode !== null) {
      closeCodes.set(record.closeCode.id, {
        key: record.closeCode.key,
        name: record.closeCode.name,
      });
    }
    if (record.slaState !== null) {
      sla.set(record.id, toTicketSlaClientSnapshot(record.slaState));
    }
    if (withCsat && record.csat !== null) {
      csat.set(record.id, record.csat);
    }
    for (const parent of [record.parentTicket, record.mergedInto]) {
      if (parent !== null) {
        parents.set(parent.id, {
          ticketNumber: parent.ticketNumber,
          title: parent.isConfidential ? null : parent.title,
        });
      }
    }
  }

  return {
    closeCodes,
    sla,
    csat,
    parents,
    labels: { users, groups, formVersions, originUnits, services },
  };
}
