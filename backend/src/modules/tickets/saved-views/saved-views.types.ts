import type { TicketPriority, TicketStatus } from '../../../generated/prisma/enums';

export type TicketSavedViewsConfiguration = {
  readonly enabled: boolean;
  readonly maxPerUser: number;
  readonly allowDefaultView: boolean;
  readonly allowSharing: boolean;
};

export type SavedViewFilters = {
  readonly search?: string;
  readonly status?: TicketStatus | '';
  readonly priority?: TicketPriority | '';
  readonly serviceId?: string;
  readonly assignedUserId?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly overdue?: boolean;
};

export type SavedViewSort = {
  readonly field: 'updatedAt' | 'createdAt' | 'priority' | 'status';
  readonly direction: 'asc' | 'desc';
};

export type SavedViewColumnKey =
  | 'number'
  | 'subject'
  | 'status'
  | 'priority'
  | 'service'
  | 'assignment'
  | 'updated';

export type SavedViewRecord = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly filters: unknown;
  readonly sort: unknown;
  readonly columns: unknown;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SavedViewResponse = {
  readonly id: string;
  readonly name: string;
  readonly filters: SavedViewFilters;
  readonly sort: SavedViewSort | null;
  readonly columns: readonly SavedViewColumnKey[];
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateSavedViewInput = {
  readonly name: string;
  readonly filters: SavedViewFilters;
  readonly sort?: SavedViewSort | null;
  readonly columns?: readonly string[];
  readonly isDefault?: boolean;
};

export type UpdateSavedViewInput = {
  readonly name?: string;
  readonly filters?: SavedViewFilters;
  readonly sort?: SavedViewSort | null;
  readonly columns?: readonly string[];
  readonly isDefault?: boolean;
};
