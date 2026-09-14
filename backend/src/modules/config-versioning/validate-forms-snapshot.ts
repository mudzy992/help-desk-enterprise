import { parseFormSchema } from '../service-catalog/parse-form-schema';
import { ServiceFormsError } from '../service-catalog/service-forms.error';
import { settingKeys } from '../settings/setting-keys';
import type {
  ConfigSnapshot,
  ConfigValidationIssue,
} from './config-versioning.types';

export function validateFormsSnapshot(
  snapshot: ConfigSnapshot,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const requireVersion =
    snapshot.settings[settingKeys.privateTicketFormsVersioningRequireVersionOnTicket] ===
    true;
  for (const form of snapshot.forms.versions) {
    try {
      parseFormSchema(form.schema);
    } catch (error) {
      const code =
        error instanceof ServiceFormsError ? error.code : 'INVALID_FORM_SCHEMA';
      issues.push({
        code,
        path: `forms.versions.${form.id}`,
        message: code,
      });
    }
  }
  if (!requireVersion) {
    return issues;
  }
  const versionsByService = new Map<string, typeof snapshot.forms.versions>();
  for (const form of snapshot.forms.versions) {
    const list = versionsByService.get(form.serviceId) ?? [];
    versionsByService.set(form.serviceId, [...list, form]);
  }
  for (const service of snapshot.catalog.services) {
    if (service.lifecycle !== 'ACTIVE') {
      continue;
    }
    const versions = versionsByService.get(service.id) ?? [];
    if (!versions.some((form) => form.status === 'ACTIVE')) {
      issues.push({
        code: 'NO_ACTIVE_FORM_VERSION',
        path: `catalog.services.${service.id}.form`,
        message: 'NO_ACTIVE_FORM_VERSION',
      });
    }
  }
  return issues;
}
