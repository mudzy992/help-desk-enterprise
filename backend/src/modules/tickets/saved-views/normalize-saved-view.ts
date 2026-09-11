import {
  ticketPriorityLevels,
  ticketStatuses,
} from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import {
  savedViewColumnKeys,
  savedViewSortFields,
  ticketSavedViewConstants,
} from './saved-views.constants';
import type {
  SavedViewColumnKey,
  SavedViewFilters,
  SavedViewSort,
} from './saved-views.types';

export function normalizeSavedViewName(name: string): string {
  const trimmed = name.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > ticketSavedViewConstants.maximumNameLength
  ) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  return trimmed;
}

export function normalizeSavedViewFilters(value: unknown): SavedViewFilters {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  const raw = value as Record<string, unknown>;
  return {
    search: optionalString(raw.search, ticketSavedViewConstants.maximumSearchLength),
    status: optionalEnum(raw.status, ticketStatuses, true),
    priority: optionalEnum(raw.priority, ticketPriorityLevels, true),
    serviceId: optionalString(raw.serviceId, 80),
    assignedUserId: optionalString(raw.assignedUserId, 80),
    createdFrom: optionalString(raw.createdFrom, 40),
    createdTo: optionalString(raw.createdTo, 40),
  };
}

export function normalizeSavedViewSort(value: unknown): SavedViewSort | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.field !== 'string' ||
    !savedViewSortFields.includes(raw.field as (typeof savedViewSortFields)[number]) ||
    (raw.direction !== 'asc' && raw.direction !== 'desc')
  ) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  return { field: raw.field as SavedViewSort['field'], direction: raw.direction };
}

export function normalizeSavedViewColumns(
  value: unknown,
): readonly SavedViewColumnKey[] {
  if (value === undefined || value === null) {
    return savedViewColumnKeys;
  }
  if (!Array.isArray(value)) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  const columns = value.filter((item): item is SavedViewColumnKey =>
    savedViewColumnKeys.includes(item as SavedViewColumnKey),
  );
  return columns.length > 0 ? columns : savedViewColumnKeys;
}

function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > max) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  return value;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  allowEmpty: boolean,
): T | '' | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (allowEmpty && value === '') {
    return '';
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TicketsError('INVALID_SAVED_VIEW');
  }
  return value as T;
}
