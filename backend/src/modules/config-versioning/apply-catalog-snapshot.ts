import type {
  AutoAssignStrategy,
  DataClassification,
  FormVersionStatus,
  ServiceAvailability,
  ServiceLifecycle,
} from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";
import { assertServiceLifecycleTransition } from "../service-catalog/assert-service-lifecycle-transition";
import { isFormVersionImmutable } from "../service-catalog/is-form-version-immutable";
import { assertServiceFormPatternsSafe } from "../service-catalog/assert-service-form-patterns-safe";
import { parseConfiguredLegacyFormSchema } from "../service-catalog/parse-configured-form-schema";
import { ServiceFormsError } from "../service-catalog/service-forms.error";
import type { ServiceFormsConfiguration } from "../service-catalog/service-forms.types";
import type { ServiceFormSchema } from "../service-catalog/form-schema.types";
import type { ServiceLifecycleConfiguration } from "../service-catalog/service-catalog.types";
import { configVersioningErrorCodes } from "./config-versioning.constants";
import { ConfigVersioningError } from "./config-versioning.error";
import {
  computeCatalogStateHash,
  stableJsonStringify,
} from "./catalog-state-hash";
import {
  toFormVersionSnapshot,
  toServiceSnapshot,
} from "./serialize-config-snapshot";
import type {
  ConfigFormVersionSnapshot,
  ConfigServiceSnapshot,
  ConfigSnapshot,
  ConfigValidationIssue,
} from "./config-versioning.types";
import {
  readSnapshotServiceFormsConfiguration,
  validateCatalogDomainSnapshot,
} from "./validate-catalog-domain-snapshot";

type CurrentService = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly lifecycle: ServiceLifecycle;
  readonly availability: ServiceAvailability;
  readonly classification: DataClassification;
  readonly requiresApproval: boolean;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy: AutoAssignStrategy;
  readonly slaProfileId: string | null;
  readonly policyPackId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type CurrentFormVersion = {
  readonly id: string;
  readonly serviceId: string;
  readonly version: number;
  readonly schema: unknown;
  readonly status: FormVersionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type FormPlan = {
  readonly current: CurrentFormVersion;
  readonly desired: ConfigFormVersionSnapshot;
  readonly schema: ServiceFormSchema;
  readonly schemaChanged: boolean;
  readonly replacement: boolean;
  readonly replacementVersion: number | null;
  readonly finalCurrentStatus: FormVersionStatus;
};

export type AppliedCatalogSnapshot = Pick<
  ConfigSnapshot,
  "catalog" | "forms" | "catalogStateHash"
>;

export async function applyCatalogSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
  currentLifecycleConfiguration: ServiceLifecycleConfiguration,
): Promise<AppliedCatalogSnapshot> {
  const snapshotIssues = validateCatalogDomainSnapshot(snapshot);
  if (snapshotIssues.length > 0) {
    throw invariantViolation(snapshotIssues);
  }

  const { services, forms } = await loadAndLockCurrentCatalog(transaction);
  assertCatalogSnapshotCurrentRows(snapshot, services, forms);

  const serviceById = new Map(services.map((service) => [service.id, service]));
  const formById = new Map(forms.map((form) => [form.id, form]));
  const formsConfiguration = readSnapshotServiceFormsConfiguration(snapshot);
  const serviceIssues = validateServiceTransitions(
    snapshot.catalog.services,
    serviceById,
    currentLifecycleConfiguration,
  );
  if (serviceIssues.length > 0) {
    throw invariantViolation(serviceIssues);
  }
  await validateCatalogReferences(transaction, snapshot.catalog.services);

  const ticketCounts = await readTicketCounts(transaction, forms);
  const formPlans = buildFormPlans(
    snapshot.forms.versions,
    formById,
    ticketCounts,
    formsConfiguration,
  );
  const formMutations = formPlans.some(
    (plan) =>
      plan.replacement ||
      plan.schemaChanged ||
      plan.current.status !== plan.desired.status,
  );
  if (formMutations && !formsConfiguration.enabled) {
    throw invariantViolation([
      issue("FORMS_DISABLED", "settings.private.ticket.forms.enabled"),
    ]);
  }
  if (
    formPlans.some((plan) => plan.replacement) &&
    !formsConfiguration.versioningEnabled
  ) {
    throw invariantViolation([
      issue(
        "FORM_VERSIONING_DISABLED",
        "settings.private.ticket.forms.versioning.enabled",
      ),
    ]);
  }

  const materializedForms = projectFormPlans(formPlans);
  const projectedIssues = validateCatalogDomainSnapshot({
    ...snapshot,
    forms: { versions: materializedForms },
  });
  if (projectedIssues.length > 0) {
    throw invariantViolation(projectedIssues);
  }

  await applyServicePlans(transaction, snapshot.catalog.services, serviceById);
  await applyFormPlans(transaction, formPlans, formsConfiguration);

  const [appliedServices, appliedForms] = await Promise.all([
    transaction.service.findMany({ orderBy: { id: "asc" } }),
    transaction.formVersion.findMany({
      orderBy: [{ serviceId: "asc" }, { version: "asc" }],
    }),
  ]);
  const appliedCatalog = appliedServices.map((service) =>
    toServiceSnapshot(service as CurrentService),
  );
  const appliedFormVersions = appliedForms.map((form) =>
    toFormVersionSnapshot(form as CurrentFormVersion),
  );
  const finalIssues = validateCatalogDomainSnapshot({
    ...snapshot,
    catalog: { services: appliedCatalog },
    forms: { versions: appliedFormVersions },
  });
  if (finalIssues.length > 0) {
    throw invariantViolation(finalIssues);
  }

  return {
    catalog: { services: appliedCatalog },
    forms: { versions: appliedFormVersions },
    catalogStateHash: computeCatalogStateHash(appliedServices, appliedForms),
  };
}

export async function assertCatalogSnapshotCurrent(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
): Promise<void> {
  const { services, forms } = await loadAndLockCurrentCatalog(transaction);
  assertCatalogSnapshotCurrentRows(snapshot, services, forms);
}

async function loadAndLockCurrentCatalog(
  transaction: Prisma.TransactionClient,
): Promise<{
  readonly services: readonly CurrentService[];
  readonly forms: readonly CurrentFormVersion[];
}> {
  // Block inserts as well as updates while comparing the complete row set; the
  // row locks below also serialize with Ticket.formVersionId's FK KEY SHARE.
  await transaction.$executeRaw`
    LOCK TABLE "Service", "FormVersion" IN SHARE ROW EXCLUSIVE MODE
  `;
  await transaction.$queryRaw`
    SELECT "id" FROM "Service" ORDER BY "id" FOR UPDATE
  `;
  await transaction.$queryRaw`
    SELECT "id" FROM "FormVersion" ORDER BY "id" FOR UPDATE
  `;

  const [currentServices, currentForms] = await Promise.all([
    transaction.service.findMany({ orderBy: { id: "asc" } }),
    transaction.formVersion.findMany({
      orderBy: [{ serviceId: "asc" }, { version: "asc" }],
    }),
  ]);
  return {
    services: currentServices as readonly CurrentService[],
    forms: currentForms as readonly CurrentFormVersion[],
  };
}

function assertCatalogSnapshotCurrentRows(
  snapshot: ConfigSnapshot,
  services: readonly CurrentService[],
  forms: readonly CurrentFormVersion[],
): void {
  assertSameEntityIds(
    snapshot.catalog.services.map((service) => service.id),
    services.map((service) => service.id),
    "catalog.services",
  );
  assertSameEntityIds(
    snapshot.forms.versions.map((form) => form.id),
    forms.map((form) => form.id),
    "forms.versions",
  );

  const currentHash = computeCatalogStateHash(services, forms);
  if (snapshot.catalogStateHash !== undefined) {
    if (snapshot.catalogStateHash !== currentHash) {
      throw stateConflict("CATALOG_STATE_CHANGED", "catalogStateHash");
    }
  } else if (!snapshotMatchesLiveRows(snapshot, services, forms)) {
    // Legacy v1 rows did not store a concurrency token. They are safe only as
    // no-ops; changed legacy candidates must be re-captured/re-imported.
    throw stateConflict("CATALOG_BASELINE_REQUIRED", "catalogStateHash");
  }
}

function snapshotMatchesLiveRows(
  snapshot: ConfigSnapshot,
  services: readonly CurrentService[],
  forms: readonly CurrentFormVersion[],
): boolean {
  const desiredServices = [...snapshot.catalog.services].sort(compareIds);
  const liveServices = services.map(toServiceSnapshot).sort(compareIds);
  const desiredForms = [...snapshot.forms.versions].sort(compareIds);
  const liveForms = forms.map(toFormVersionSnapshot).sort(compareIds);
  return (
    stableJsonStringify(desiredServices) ===
      stableJsonStringify(liveServices) &&
    stableJsonStringify(desiredForms) === stableJsonStringify(liveForms)
  );
}

function compareIds(
  left: { readonly id: string },
  right: { readonly id: string },
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function assertSameEntityIds(
  desiredIds: readonly string[],
  liveIds: readonly string[],
  path: string,
): void {
  const desired = new Set(desiredIds);
  const live = new Set(liveIds);
  if (
    desired.size !== desiredIds.length ||
    live.size !== liveIds.length ||
    desired.size !== live.size ||
    [...desired].some((id) => !live.has(id))
  ) {
    throw stateConflict("CATALOG_ENTITY_SET_CHANGED", path);
  }
}

function validateServiceTransitions(
  desiredServices: readonly ConfigServiceSnapshot[],
  currentById: ReadonlyMap<string, CurrentService>,
  configuration: ServiceLifecycleConfiguration,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  for (const desired of desiredServices) {
    const current = currentById.get(desired.id);
    if (current === undefined) {
      issues.push(issue("SERVICE_NOT_FOUND", `catalog.services.${desired.id}`));
      continue;
    }
    if (desired.slug !== current.slug) {
      issues.push(
        issue("SERVICE_SLUG_IMMUTABLE", `catalog.services.${desired.id}.slug`),
      );
    }
    if (desired.lifecycle === current.lifecycle) {
      continue;
    }
    try {
      assertServiceLifecycleTransition({
        from: current.lifecycle,
        to: desired.lifecycle as ServiceLifecycle,
        configuration,
      });
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "INVALID_SERVICE_LIFECYCLE_TRANSITION";
      issues.push(issue(code, `catalog.services.${desired.id}.lifecycle`));
    }
  }
  return issues;
}

async function validateCatalogReferences(
  transaction: Prisma.TransactionClient,
  services: readonly ConfigServiceSnapshot[],
): Promise<void> {
  const categoryIds = [
    ...new Set(services.map((service) => service.categoryId)),
  ];
  const slaProfileIds = [
    ...new Set(
      services
        .map((service) => service.slaProfileId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const policyPackIds = [
    ...new Set(
      services
        .map((service) => service.policyPackId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const [categories, profiles, policyPacks] = await Promise.all([
    transaction.serviceCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    }),
    transaction.slaProfile.findMany({
      where: { id: { in: slaProfileIds } },
      select: { id: true },
    }),
    transaction.policyPack.findMany({
      where: { id: { in: policyPackIds } },
      select: { id: true },
    }),
  ]);
  const categorySet = new Set(categories.map((row) => row.id));
  const profileSet = new Set(profiles.map((row) => row.id));
  const policyPackSet = new Set(policyPacks.map((row) => row.id));
  const issues: ConfigValidationIssue[] = [];
  for (const service of services) {
    const path = `catalog.services.${service.id}`;
    if (!categorySet.has(service.categoryId)) {
      issues.push(issue("SERVICE_CATEGORY_MISSING", `${path}.categoryId`));
    }
    if (
      service.slaProfileId !== null &&
      !profileSet.has(service.slaProfileId)
    ) {
      issues.push(issue("SERVICE_SLA_PROFILE_MISSING", `${path}.slaProfileId`));
    }
    if (
      service.policyPackId !== null &&
      !policyPackSet.has(service.policyPackId)
    ) {
      issues.push(issue("SERVICE_POLICY_PACK_MISSING", `${path}.policyPackId`));
    }
  }
  if (issues.length > 0) {
    throw invariantViolation(issues);
  }
}

async function readTicketCounts(
  transaction: Prisma.TransactionClient,
  forms: readonly CurrentFormVersion[],
): Promise<ReadonlyMap<string, number>> {
  if (forms.length === 0) {
    return new Map();
  }
  const rows = await transaction.ticket.groupBy({
    by: ["formVersionId"],
    where: { formVersionId: { in: forms.map((form) => form.id) } },
    _count: { _all: true },
  });
  return new Map(
    rows.flatMap((row) =>
      row.formVersionId === null
        ? []
        : [[row.formVersionId, row._count._all] as const],
    ),
  );
}

function buildFormPlans(
  desiredForms: readonly ConfigFormVersionSnapshot[],
  currentById: ReadonlyMap<string, CurrentFormVersion>,
  ticketCounts: ReadonlyMap<string, number>,
  configuration: ServiceFormsConfiguration,
): readonly FormPlan[] {
  const latestVersionByService = new Map<string, number>();
  for (const current of currentById.values()) {
    latestVersionByService.set(
      current.serviceId,
      Math.max(
        latestVersionByService.get(current.serviceId) ?? 0,
        current.version,
      ),
    );
  }

  const plans: FormPlan[] = [];
  const ordered = [...desiredForms].sort((left, right) => {
    const serviceCompare = left.serviceId.localeCompare(right.serviceId);
    return serviceCompare !== 0 ? serviceCompare : left.version - right.version;
  });
  for (const desired of ordered) {
    const current = currentById.get(desired.id);
    if (current === undefined) {
      throw stateConflict(
        "FORM_VERSION_NOT_FOUND",
        `forms.versions.${desired.id}`,
      );
    }
    if (
      current.serviceId !== desired.serviceId ||
      current.version !== desired.version
    ) {
      throw invariantViolation([
        issue(
          "FORM_VERSION_IDENTITY_IMMUTABLE",
          `forms.versions.${desired.id}`,
        ),
      ]);
    }
    if (current.status === "DRAFT" && desired.status === "RETIRED") {
      throw invariantViolation([
        issue(
          "INVALID_FORM_VERSION_TRANSITION",
          `forms.versions.${desired.id}.status`,
        ),
      ]);
    }

    let schema: ServiceFormSchema;
    try {
      schema = parseConfiguredLegacyFormSchema(desired.schema, configuration);
    } catch (error) {
      const code =
        error instanceof ServiceFormsError ? error.code : "INVALID_FORM_SCHEMA";
      throw invariantViolation([
        issue(code, `forms.versions.${desired.id}.schema`),
      ]);
    }
    const schemaChanged =
      stableJsonStringify(current.schema) !== stableJsonStringify(schema);
    const immutable = isFormVersionImmutable(
      { status: current.status },
      ticketCounts.get(current.id) ?? 0,
    );
    const requiresNewLifecycleVersion =
      (current.status === "RETIRED" && desired.status !== "RETIRED") ||
      (current.status === "ACTIVE" && desired.status === "DRAFT");
    const replacement =
      (schemaChanged && immutable) || requiresNewLifecycleVersion;
    if (schemaChanged || desired.status === "ACTIVE" || replacement) {
      try {
        assertServiceFormPatternsSafe(schema);
      } catch (error) {
        const code =
          error instanceof ServiceFormsError
            ? error.code
            : "INVALID_FORM_SCHEMA";
        throw invariantViolation([
          issue(code, `forms.versions.${desired.id}.schema`),
        ]);
      }
    }
    if (replacement && desired.status === "RETIRED") {
      throw invariantViolation([
        issue(
          "INVALID_FORM_VERSION_TRANSITION",
          `forms.versions.${desired.id}.status`,
        ),
      ]);
    }
    let replacementVersion: number | null = null;
    if (replacement) {
      const latest =
        latestVersionByService.get(current.serviceId) ?? current.version;
      replacementVersion = latest + 1;
      if (
        !Number.isSafeInteger(replacementVersion) ||
        replacementVersion > 2_147_483_647
      ) {
        throw invariantViolation([
          issue(
            "FORM_VERSION_NUMBER_EXHAUSTED",
            `forms.versions.${desired.id}.version`,
          ),
        ]);
      }
      latestVersionByService.set(current.serviceId, replacementVersion);
    }

    let finalCurrentStatus = current.status;
    if (replacement && current.status === "ACTIVE") {
      if (
        desired.status !== "ACTIVE" ||
        !configuration.allowMultipleActiveVersions
      ) {
        finalCurrentStatus = "RETIRED";
      }
    } else if (!replacement) {
      finalCurrentStatus = desired.status as FormVersionStatus;
    }

    plans.push({
      current,
      desired,
      schema,
      schemaChanged,
      replacement,
      replacementVersion,
      finalCurrentStatus,
    });
  }
  return plans;
}

function projectFormPlans(
  plans: readonly FormPlan[],
): readonly ConfigFormVersionSnapshot[] {
  return plans.flatMap((plan, index) => {
    const currentSchema = plan.replacement ? plan.current.schema : plan.schema;
    const currentSnapshot: ConfigFormVersionSnapshot = {
      id: plan.current.id,
      serviceId: plan.current.serviceId,
      version: plan.current.version,
      schema: jsonValue(currentSchema),
      status: plan.finalCurrentStatus,
    };
    if (!plan.replacement || plan.replacementVersion === null) {
      return [currentSnapshot];
    }
    const replacementSnapshot: ConfigFormVersionSnapshot = {
      // A deterministic temporary ID is sufficient for projected validation;
      // the actual Prisma-generated id is returned after the transaction writes.
      id: `__config_replacement_${index}__`,
      serviceId: plan.current.serviceId,
      version: plan.replacementVersion,
      schema: jsonValue(plan.schema),
      status: plan.desired.status,
    };
    return [currentSnapshot, replacementSnapshot];
  });
}

async function applyServicePlans(
  transaction: Prisma.TransactionClient,
  desiredServices: readonly ConfigServiceSnapshot[],
  currentById: ReadonlyMap<string, CurrentService>,
): Promise<void> {
  for (const desired of desiredServices) {
    const current = currentById.get(desired.id);
    if (current === undefined) {
      throw stateConflict(
        "SERVICE_NOT_FOUND",
        `catalog.services.${desired.id}`,
      );
    }
    if (current.slug !== desired.slug) {
      throw invariantViolation([
        issue("SERVICE_SLUG_IMMUTABLE", `catalog.services.${desired.id}.slug`),
      ]);
    }
    const data = {
      name: desired.name.trim().replace(/\s+/gu, " "),
      categoryId: desired.categoryId,
      lifecycle: desired.lifecycle as ServiceLifecycle,
      availability: desired.availability as ServiceAvailability,
      classification: desired.classification as DataClassification,
      requiresApproval: desired.requiresApproval,
      isConfidentialDefault: desired.isConfidentialDefault,
      autoAssignStrategy: desired.autoAssignStrategy as AutoAssignStrategy,
      slaProfileId: desired.slaProfileId,
      policyPackId: desired.policyPackId,
    };
    const changed =
      current.name !== data.name ||
      current.categoryId !== data.categoryId ||
      current.lifecycle !== data.lifecycle ||
      current.availability !== data.availability ||
      current.classification !== data.classification ||
      current.requiresApproval !== data.requiresApproval ||
      current.isConfidentialDefault !== data.isConfidentialDefault ||
      current.autoAssignStrategy !== data.autoAssignStrategy ||
      current.slaProfileId !== data.slaProfileId ||
      current.policyPackId !== data.policyPackId;
    if (!changed) {
      continue;
    }
    await transaction.service.update({ where: { id: current.id }, data });
  }
}

async function applyFormPlans(
  transaction: Prisma.TransactionClient,
  plans: readonly FormPlan[],
  configuration: ServiceFormsConfiguration,
): Promise<void> {
  for (const plan of plans) {
    if (plan.replacement) {
      if (plan.finalCurrentStatus !== plan.current.status) {
        await transaction.formVersion.update({
          where: { id: plan.current.id },
          data: { status: plan.finalCurrentStatus },
        });
      }
      const created = await transaction.formVersion.create({
        data: {
          serviceId: plan.current.serviceId,
          version: plan.replacementVersion!,
          schema: plan.schema as Prisma.InputJsonValue,
          status: "DRAFT",
        },
      });
      if (plan.desired.status === "ACTIVE") {
        await activateFormVersion(
          transaction,
          plan.current.serviceId,
          created.id,
          configuration.allowMultipleActiveVersions,
        );
      }
      continue;
    }

    if (plan.desired.status === "ACTIVE" && plan.current.status === "DRAFT") {
      await activateFormVersion(
        transaction,
        plan.current.serviceId,
        plan.current.id,
        configuration.allowMultipleActiveVersions,
        plan.schemaChanged ? plan.schema : undefined,
      );
      continue;
    }

    const data: Prisma.FormVersionUpdateInput = {};
    if (plan.schemaChanged) {
      data.schema = plan.schema as Prisma.InputJsonValue;
    }
    if (plan.finalCurrentStatus !== plan.current.status) {
      data.status = plan.finalCurrentStatus;
    }
    if (Object.keys(data).length > 0) {
      await transaction.formVersion.update({
        where: { id: plan.current.id },
        data,
      });
    }
  }
}

async function activateFormVersion(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  formVersionId: string,
  allowMultipleActiveVersions: boolean,
  schema?: ServiceFormSchema,
): Promise<void> {
  if (!allowMultipleActiveVersions) {
    await transaction.formVersion.updateMany({
      where: {
        serviceId,
        status: "ACTIVE",
        id: { not: formVersionId },
      },
      data: { status: "RETIRED" },
    });
  }
  await transaction.formVersion.update({
    where: { id: formVersionId },
    data: {
      ...(schema === undefined
        ? {}
        : { schema: schema as Prisma.InputJsonValue }),
      status: "ACTIVE",
    },
  });
}

function jsonValue(value: unknown): ConfigFormVersionSnapshot["schema"] {
  return JSON.parse(
    JSON.stringify(value),
  ) as ConfigFormVersionSnapshot["schema"];
}

function stateConflict(code: string, path: string): ConfigVersioningError {
  return new ConfigVersioningError(
    configVersioningErrorCodes.catalogStateConflict,
    [issue(code, path)],
  );
}

function invariantViolation(
  details: readonly ConfigValidationIssue[],
): ConfigVersioningError {
  return new ConfigVersioningError(
    configVersioningErrorCodes.catalogInvariantViolation,
    details,
  );
}

function issue(code: string, path: string): ConfigValidationIssue {
  return { code, path, message: code };
}
