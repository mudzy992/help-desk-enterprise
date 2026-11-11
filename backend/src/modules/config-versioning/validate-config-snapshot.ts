import type { SettingsRegistry } from '../settings/settings.types';
import { configVersioningScopes } from './config-versioning.constants';
import type {
  ConfigSnapshot,
  ConfigValidationIssue,
  ConfigVersioningConfiguration,
} from './config-versioning.types';
import { validateFormsSnapshot } from './validate-forms-snapshot';
import { validateRoutingSnapshot } from './validate-routing-snapshot';
import { validateSettingsSnapshot } from './validate-settings-snapshot';
import { validateSlaSnapshot } from './validate-sla-snapshot';

export function validateConfigSnapshot(
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
  configuration: ConfigVersioningConfiguration,
): readonly ConfigValidationIssue[] {
  if (!configuration.validationEnabled) {
    return [];
  }
  const scopes = new Set(configuration.scopes);
  const issues: ConfigValidationIssue[] = [];
  if (scopes.has(configVersioningScopes.settings)) {
    issues.push(...validateSettingsSnapshot(snapshot, registry));
  }
  if (scopes.has(configVersioningScopes.routing)) {
    issues.push(...validateRoutingSnapshot(snapshot));
  }
  if (scopes.has(configVersioningScopes.sla)) {
    issues.push(...validateSlaSnapshot(snapshot));
  }
  if (
    scopes.has(configVersioningScopes.serviceForms) ||
    scopes.has(configVersioningScopes.serviceCatalog)
  ) {
    issues.push(...validateFormsSnapshot(snapshot));
  }
  return issues;
}
