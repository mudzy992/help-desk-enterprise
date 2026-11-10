import { serviceLifecycleStates } from "../service-catalog/service-catalog.constants";
import {
  defaultServiceFormsConfiguration,
  formVersionStatuses,
} from "../service-catalog/service-forms.constants";
import type { ServiceFormsConfiguration } from "../service-catalog/service-forms.types";
import {
  parseConfiguredFormSchema,
  parseConfiguredLegacyFormSchema,
} from "../service-catalog/parse-configured-form-schema";
import { ServiceFormsError } from "../service-catalog/service-forms.error";
import { settingKeys } from "../settings/setting-keys";
import type {
  ConfigSnapshot,
  ConfigValidationIssue,
} from "./config-versioning.types";

const serviceAvailabilityStates = [
  "OPERATIONAL",
  "DEGRADED",
  "DOWN",
  "MAINTENANCE",
] as const;
const dataClassificationStates = [
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;
const autoAssignStrategies = ["NONE", "LEAST_BUSY", "ROUND_ROBIN"] as const;
const serviceSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const maximumServiceNameLength = 128;
const maximumServiceSlugLength = 64;

/**
 * Invariants that must hold even when optional config-version validation is
 * switched off. Database-dependent existence, transition and stale-state
 * checks run again inside the activation transaction.
 */
export function validateCatalogDomainSnapshot(
  snapshot: ConfigSnapshot,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const formsConfiguration = readSnapshotServiceFormsConfiguration(
    snapshot,
    issues,
  );
  const serviceIds = new Set<string>();
  const slugs = new Set<string>();

  for (const service of snapshot.catalog.services) {
    const path = `catalog.services.${service.id}`;
    if (serviceIds.has(service.id)) {
      issues.push(issue("DUPLICATE_SERVICE_ID", path));
    }
    serviceIds.add(service.id);

    if (
      service.name.trim().length === 0 ||
      service.name.trim().length > maximumServiceNameLength
    ) {
      issues.push(issue("INVALID_SERVICE_NAME", `${path}.name`));
    }
    if (
      service.slug.length === 0 ||
      service.slug.length > maximumServiceSlugLength ||
      !serviceSlugPattern.test(service.slug)
    ) {
      issues.push(issue("INVALID_SERVICE_SLUG", `${path}.slug`));
    }
    if (slugs.has(service.slug)) {
      issues.push(issue("DUPLICATE_SERVICE_SLUG", `${path}.slug`));
    }
    slugs.add(service.slug);

    if (
      !(serviceLifecycleStates as readonly string[]).includes(service.lifecycle)
    ) {
      issues.push(issue("INVALID_SERVICE_LIFECYCLE", `${path}.lifecycle`));
    }
    if (
      !(serviceAvailabilityStates as readonly string[]).includes(
        service.availability,
      )
    ) {
      issues.push(
        issue("INVALID_SERVICE_AVAILABILITY", `${path}.availability`),
      );
    }
    if (
      !(dataClassificationStates as readonly string[]).includes(
        service.classification,
      )
    ) {
      issues.push(
        issue("INVALID_SERVICE_CLASSIFICATION", `${path}.classification`),
      );
    }
    if (
      !(autoAssignStrategies as readonly string[]).includes(
        service.autoAssignStrategy,
      )
    ) {
      issues.push(
        issue("INVALID_AUTO_ASSIGN_STRATEGY", `${path}.autoAssignStrategy`),
      );
    }
    if (service.categoryId.trim().length === 0) {
      issues.push(issue("SERVICE_CATEGORY_MISSING", `${path}.categoryId`));
    }
  }

  const formIds = new Set<string>();
  const formVersionKeys = new Set<string>();
  const activeFormsByService = new Map<string, number>();
  for (const form of snapshot.forms.versions) {
    const path = `forms.versions.${form.id}`;
    if (formIds.has(form.id)) {
      issues.push(issue("DUPLICATE_FORM_VERSION_ID", path));
    }
    formIds.add(form.id);

    if (!serviceIds.has(form.serviceId)) {
      issues.push(issue("FORM_SERVICE_MISSING", `${path}.serviceId`));
    }
    if (!Number.isSafeInteger(form.version) || form.version < 1) {
      issues.push(issue("INVALID_FORM_VERSION_NUMBER", `${path}.version`));
    }
    const versionKey = `${form.serviceId}\u0000${form.version}`;
    if (formVersionKeys.has(versionKey)) {
      issues.push(issue("DUPLICATE_FORM_VERSION_NUMBER", `${path}.version`));
    }
    formVersionKeys.add(versionKey);

    if (!(formVersionStatuses as readonly string[]).includes(form.status)) {
      issues.push(issue("INVALID_FORM_VERSION_STATUS", `${path}.status`));
    }
    try {
      if (form.status === "ACTIVE") {
        parseConfiguredFormSchema(form.schema, formsConfiguration);
      } else {
        parseConfiguredLegacyFormSchema(form.schema, formsConfiguration);
      }
    } catch (error) {
      const code =
        error instanceof ServiceFormsError ? error.code : "INVALID_FORM_SCHEMA";
      issues.push(issue(code, `${path}.schema`));
    }
    if (form.status === "ACTIVE") {
      activeFormsByService.set(
        form.serviceId,
        (activeFormsByService.get(form.serviceId) ?? 0) + 1,
      );
    }
  }

  for (const service of snapshot.catalog.services) {
    const activeCount = activeFormsByService.get(service.id) ?? 0;
    if (service.lifecycle === "ACTIVE" && activeCount === 0) {
      issues.push(
        issue("NO_ACTIVE_FORM_VERSION", `catalog.services.${service.id}.form`),
      );
    }
    if (!formsConfiguration.allowMultipleActiveVersions && activeCount > 1) {
      issues.push(
        issue(
          "MULTIPLE_ACTIVE_FORM_VERSIONS",
          `catalog.services.${service.id}.forms`,
        ),
      );
    }
  }

  return issues;
}

export function readSnapshotServiceFormsConfiguration(
  snapshot: ConfigSnapshot,
  issues: ConfigValidationIssue[] = [],
): ServiceFormsConfiguration {
  const booleanSetting = (key: string, fallback: boolean): boolean => {
    const value = snapshot.settings[key];
    if (value === undefined) {
      return fallback;
    }
    if (typeof value !== "boolean") {
      issues.push(issue("INVALID_CATALOG_CONFIGURATION", `settings.${key}`));
      return fallback;
    }
    return value;
  };

  return {
    enabled: booleanSetting(
      settingKeys.privateTicketFormsEnabled,
      defaultServiceFormsConfiguration.enabled,
    ),
    requireStructuredFields: booleanSetting(
      settingKeys.privateTicketFormsRequireStructuredFields,
      defaultServiceFormsConfiguration.requireStructuredFields,
    ),
    versioningEnabled: booleanSetting(
      settingKeys.privateTicketFormsVersioningEnabled,
      defaultServiceFormsConfiguration.versioningEnabled,
    ),
    allowMultipleActiveVersions: booleanSetting(
      settingKeys.privateTicketFormsVersioningAllowMultipleActiveVersions,
      defaultServiceFormsConfiguration.allowMultipleActiveVersions,
    ),
    requireVersionOnTicket: booleanSetting(
      settingKeys.privateTicketFormsVersioningRequireVersionOnTicket,
      defaultServiceFormsConfiguration.requireVersionOnTicket,
    ),
  };
}

function issue(code: string, path: string): ConfigValidationIssue {
  return { code, path, message: code };
}
