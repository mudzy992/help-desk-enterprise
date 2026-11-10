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
import { validateCatalogDomainSnapshot } from './validate-catalog-domain-snapshot';

export function validateMandatoryConfigSnapshot(
  snapshot: ConfigSnapshot,
): readonly ConfigValidationIssue[] {
  return deduplicateIssues([
    ...validateCatalogDomainSnapshot(snapshot),
    ...validateRoutingSnapshot(snapshot),
  ]);
}

export function validateConfigSnapshot(
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
  configuration: ConfigVersioningConfiguration,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [
    ...validateMandatoryConfigSnapshot(snapshot),
  ];
  if (!configuration.validationEnabled) {
    return issues;
  }
  const scopes = new Set(configuration.scopes);
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
  return deduplicateIssues(issues);
}

function deduplicateIssues(
  issues: readonly ConfigValidationIssue[],
): readonly ConfigValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}\u0000${issue.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
