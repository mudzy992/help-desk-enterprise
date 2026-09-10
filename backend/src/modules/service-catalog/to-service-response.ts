import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import type { ServiceRecord, ServiceResponse } from './service-catalog.types';

export function toServiceResponse(record: ServiceRecord): ServiceResponse {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    categoryId: record.categoryId,
    lifecycle: record.lifecycle,
    offeredToRequesters: isServiceOfferedToRequesters(record.lifecycle),
    availability: record.availability,
    classification: record.classification,
    requiresApproval: record.requiresApproval,
    isConfidentialDefault: record.isConfidentialDefault,
    autoAssignStrategy: record.autoAssignStrategy,
    slaProfileId: record.slaProfileId,
    policyPackId: record.policyPackId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
