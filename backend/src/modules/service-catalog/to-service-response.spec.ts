import { defaultTicketApprovalsConfiguration } from '../tickets/approvals/approvals.constants';
import type { ServiceRecord } from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

const now = new Date('2026-01-01T00:00:00.000Z');

function buildServiceRecord(overrides: Partial<ServiceRecord>): ServiceRecord {
  return {
    id: 'service-1',
    name: 'VPN access',
    slug: 'vpn-access',
    categoryId: 'category-1',
    lifecycle: 'ACTIVE',
    availability: 'OPERATIONAL',
    classification: 'INTERNAL',
    requiresApproval: false,
    isConfidentialDefault: false,
    autoAssignStrategy: 'NONE',
    slaProfileId: null,
    policyPackId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('toServiceResponse approvalSteps', () => {
  it('is 0 for a service that does not require approval, by default configuration', () => {
    const response = toServiceResponse(buildServiceRecord({ requiresApproval: false }));
    expect(response.approvalSteps).toBe(0);
  });

  it('is 1 for a service that requires approval, by default configuration', () => {
    const response = toServiceResponse(buildServiceRecord({ requiresApproval: true }));
    expect(response.approvalSteps).toBe(1);
  });

  it('lets a per-service overlay override the service flag in either direction', () => {
    const record = buildServiceRecord({ requiresApproval: true });
    const overriddenOff = toServiceResponse(record, [], undefined, 0, {
      ...defaultTicketApprovalsConfiguration,
      requiredByService: { 'service-1': false },
    });
    expect(overriddenOff.approvalSteps).toBe(0);
    const plain = buildServiceRecord({ requiresApproval: false });
    const overriddenOn = toServiceResponse(plain, [], undefined, 0, {
      ...defaultTicketApprovalsConfiguration,
      requiredByService: { 'service-1': true },
    });
    expect(overriddenOn.approvalSteps).toBe(1);
  });

  it('is 0 for every service when the approvals addon is disabled globally', () => {
    const record = buildServiceRecord({ requiresApproval: true });
    const response = toServiceResponse(record, [], undefined, 0, {
      ...defaultTicketApprovalsConfiguration,
      enabled: false,
    });
    expect(response.approvalSteps).toBe(0);
  });
});
