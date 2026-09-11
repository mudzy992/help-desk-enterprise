import { TicketsError } from '../tickets.error';
import { defaultTicketSavedViewsConfiguration } from './saved-views.constants';
import type { TicketSavedViewsConfiguration } from './saved-views.types';

export function parseTicketSavedViewsConfiguration(input: {
  readonly addonEnabled: unknown;
  readonly enabled: unknown;
  readonly maxPerUser: unknown;
  readonly allowDefaultView: unknown;
  readonly allowSharing: unknown;
}): TicketSavedViewsConfiguration {
  if (input.addonEnabled !== true || input.enabled !== true) {
    return { ...defaultTicketSavedViewsConfiguration, enabled: false };
  }
  if (
    typeof input.maxPerUser !== 'number' ||
    !Number.isFinite(input.maxPerUser) ||
    input.maxPerUser <= 0 ||
    typeof input.allowDefaultView !== 'boolean' ||
    typeof input.allowSharing !== 'boolean'
  ) {
    throw new TicketsError('SAVED_VIEWS_UNAVAILABLE');
  }
  return {
    enabled: true,
    maxPerUser: Math.floor(input.maxPerUser),
    allowDefaultView: input.allowDefaultView,
    allowSharing: false,
  };
}
