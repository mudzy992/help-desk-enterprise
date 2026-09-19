import type { TicketExportColumn } from './export.constants';
import type { ListTicketsQuery } from '../tickets.types';

export type ExportTicketsQuery = Pick<
  ListTicketsQuery,
  'originUnitId' | 'serviceId' | 'status' | 'assignedUserId' | 'priority' | 'q'
> & {
  readonly requesterId?: string;
  readonly unassigned?: boolean;
  readonly overdue?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
};

export type TicketExportRow = Readonly<
  Record<TicketExportColumn, string | number | null>
>;

export type TicketsExportResult = {
  readonly fileName: string;
  readonly contentType: string;
  readonly content: string;
  readonly recordCount: number;
};
