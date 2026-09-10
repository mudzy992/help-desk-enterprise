import type { SettingVisibility } from './settings.types';

export interface SettingPersistenceClassification {
  readonly scope: 'PUBLIC' | 'PRIVATE';
  readonly isSecret: boolean;
}

export function mapVisibilityToPersistence(
  visibility: SettingVisibility,
): SettingPersistenceClassification {
  if (visibility === 'public') {
    return { scope: 'PUBLIC', isSecret: false };
  }
  if (visibility === 'secret') {
    return { scope: 'PRIVATE', isSecret: true };
  }
  return { scope: 'PRIVATE', isSecret: false };
}
