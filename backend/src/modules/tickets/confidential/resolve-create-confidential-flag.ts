import type { TicketConfidentialConfiguration } from './confidential.types';

export function resolveCreateConfidentialFlag(input: {
  readonly requested?: boolean;
  readonly serviceId: string;
  readonly serviceDefault: boolean;
  readonly configuration: TicketConfidentialConfiguration;
}): boolean {
  if (input.requested !== undefined) {
    return input.requested;
  }
  if (input.configuration.defaultForServiceIds.includes(input.serviceId)) {
    return true;
  }
  return input.serviceDefault;
}
