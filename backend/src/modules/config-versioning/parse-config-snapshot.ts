import { configSnapshotSchemaVersion } from './config-versioning.constants';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';
import { isPlainObject } from './read-snapshot-primitives';
import { parseCatalogAndForms } from './parse-snapshot-catalog';
import { parseRoutingAndReferences } from './parse-snapshot-routing';
import { parseSettingsRecord } from './parse-snapshot-settings';
import { parseSlaSection } from './parse-snapshot-sla';
import { parseTemplatesSection } from './parse-snapshot-templates';

export function parseConfigSnapshot(value: unknown): ConfigSnapshot {
  if (!isPlainObject(value)) {
    throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
  }
  if (value.schemaVersion !== configSnapshotSchemaVersion) {
    throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
  }
  if (typeof value.capturedAt !== 'string' || value.capturedAt.trim() === '') {
    throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
  }
  if (
    !Array.isArray(value.scopes) ||
    value.scopes.some((scope) => typeof scope !== 'string')
  ) {
    throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
  }
  const rollbackOfVersion =
    value.rollbackOfVersion === null
      ? null
      : typeof value.rollbackOfVersion === 'number'
        ? value.rollbackOfVersion
        : undefined;
  if (rollbackOfVersion === undefined) {
    throw new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
  }
  const settings = parseSettingsRecord(value.settings);
  const routing = parseRoutingAndReferences(value.routing, value.references);
  const sla = parseSlaSection(value.sla);
  const catalogAndForms = parseCatalogAndForms(value.catalog, value.forms);
  return {
    schemaVersion: 1,
    capturedAt: value.capturedAt,
    scopes: value.scopes as string[],
    rollbackOfVersion,
    settings,
    routing: routing.routing,
    references: routing.references,
    sla,
    catalog: catalogAndForms.catalog,
    forms: catalogAndForms.forms,
    ...(value.templates === undefined ? {} : { templates: parseTemplatesSection(value.templates) }),
  };
}
