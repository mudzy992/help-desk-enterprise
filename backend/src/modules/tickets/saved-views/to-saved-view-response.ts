import type { SavedViewRecord, SavedViewResponse } from './saved-views.types';
import {
  normalizeSavedViewColumns,
  normalizeSavedViewFilters,
  normalizeSavedViewSort,
} from './normalize-saved-view';

export function toSavedViewResponse(record: SavedViewRecord): SavedViewResponse {
  return {
    id: record.id,
    name: record.name,
    filters: normalizeSavedViewFilters(record.filters),
    sort: normalizeSavedViewSort(record.sort),
    columns: normalizeSavedViewColumns(record.columns),
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
