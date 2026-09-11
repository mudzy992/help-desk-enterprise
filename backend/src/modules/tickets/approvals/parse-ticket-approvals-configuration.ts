import { TicketsError } from '../tickets.error';
import {
  defaultApproverRoles,
  defaultTicketApprovalsConfiguration,
} from './approvals.constants';
import type {
  DefaultApproverRole,
  TicketApprovalsConfiguration,
} from './approvals.types';

export function parseTicketApprovalsConfiguration(input: {
  readonly addonEnabled: unknown;
  readonly enabled: unknown;
  readonly requiredByServiceJson: unknown;
  readonly defaultApproverRole: unknown;
  readonly allowRequesterManager: unknown;
}): TicketApprovalsConfiguration {
  if (input.addonEnabled !== true || input.enabled !== true) {
    return {
      ...defaultTicketApprovalsConfiguration,
      enabled: false,
    };
  }
  if (
    typeof input.defaultApproverRole !== 'string' ||
    typeof input.allowRequesterManager !== 'boolean'
  ) {
    throw new TicketsError('APPROVALS_UNAVAILABLE');
  }
  return {
    enabled: true,
    requiredByService: parseRequiredByServiceJson(input.requiredByServiceJson),
    defaultApproverRole: parseDefaultApproverRole(input.defaultApproverRole),
    allowRequesterManager: input.allowRequesterManager,
  };
}

function parseDefaultApproverRole(value: string): DefaultApproverRole {
  const role = value.trim() as DefaultApproverRole;
  if (!defaultApproverRoles.includes(role)) {
    throw new TicketsError('APPROVALS_UNAVAILABLE');
  }
  return role;
}

function parseRequiredByServiceJson(
  value: unknown,
): Readonly<Record<string, boolean>> {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value !== 'string') {
    throw new TicketsError('APPROVALS_UNAVAILABLE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new TicketsError('APPROVALS_UNAVAILABLE');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new TicketsError('APPROVALS_UNAVAILABLE');
  }
  const requiredByService: Record<string, boolean> = {};
  for (const [serviceId, policy] of Object.entries(parsed)) {
    if (serviceId.trim().length === 0) {
      throw new TicketsError('APPROVALS_UNAVAILABLE');
    }
    requiredByService[serviceId] = parsePolicyRequired(policy);
  }
  return requiredByService;
}

function parsePolicyRequired(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'required' in value &&
    typeof value.required === 'boolean'
  ) {
    return value.required;
  }
  throw new TicketsError('APPROVALS_UNAVAILABLE');
}
