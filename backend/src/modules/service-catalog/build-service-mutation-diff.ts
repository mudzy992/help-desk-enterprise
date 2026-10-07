import type { ServiceRecord } from './service-catalog.types';

const serviceDiffFields = [
  'name',
  'categoryId',
  'classification',
  'requiresApproval',
  'isConfidentialDefault',
  'autoAssignStrategy',
  'policyPackId',
  'slaProfileId',
] as const;

type ServiceDiffField = (typeof serviceDiffFields)[number];

export function buildServiceMutationSnapshot(
  record: Pick<ServiceRecord, ServiceDiffField>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of serviceDiffFields) {
    snapshot[field] = record[field];
  }
  return snapshot;
}

export function buildServiceMutationDiff(
  before: Pick<ServiceRecord, ServiceDiffField>,
  after: Pick<ServiceRecord, ServiceDiffField>,
): { readonly before: Record<string, unknown>; readonly after: Record<string, unknown> } {
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  const beforeSnapshot = buildServiceMutationSnapshot(before);
  const afterSnapshot = buildServiceMutationSnapshot(after);
  for (const field of serviceDiffFields) {
    if (beforeSnapshot[field] !== afterSnapshot[field]) {
      beforeDiff[field] = beforeSnapshot[field];
      afterDiff[field] = afterSnapshot[field];
    }
  }
  return { before: beforeDiff, after: afterDiff };
}

export function hasServiceMutationChanges(
  input: {
    readonly name?: unknown;
    readonly categoryId?: unknown;
    readonly classification?: unknown;
    readonly requiresApproval?: unknown;
    readonly isConfidentialDefault?: unknown;
    readonly autoAssignStrategy?: unknown;
    readonly policyPackId?: unknown;
    readonly slaProfileId?: unknown;
  },
  record: Pick<ServiceRecord, ServiceDiffField>,
): boolean {
  return serviceDiffFields.some((field) => {
    if (field === 'name' || field === 'categoryId') {
      return input[field] !== undefined && input[field] !== record[field];
    }
    return input[field] !== undefined && input[field] !== record[field];
  });
}
