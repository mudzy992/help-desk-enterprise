import { TicketsError } from '../tickets.error';
import type { ExecuteTicketBulkInput, TicketBulkConfiguration } from './bulk.types';

/**
 * Val 3 (M12/B5): the field labels were hardcoded in English (`What happened:`,
 * `Who is affected:`, `ETA:`, `Workaround:`) and the same text was stored on the
 * ticket and used as the body of the localized `ticket.broadcast` e-mail — the
 * requester got a Bosnian e-mail with an English body. The labels are now picked
 * by locale: the stored message follows the sender's language, and the e-mail is
 * formatted per recipient (see `send-broadcast-emails.ts`).
 */
export type BroadcastTextLocale = 'bs' | 'en';

export type BulkBroadcastParts = {
  readonly whatHappened: string;
  readonly whoAffected: string;
  readonly eta: string;
  readonly workaround: string | null;
};

const broadcastLabels: Readonly<
  Record<
    BroadcastTextLocale,
    {
      readonly whatHappened: string;
      readonly whoAffected: string;
      readonly eta: string;
      readonly workaround: string;
    }
  >
> = {
  bs: {
    whatHappened: 'Šta se desilo',
    whoAffected: 'Koga pogađa',
    eta: 'Procjena rješenja (ETA)',
    workaround: 'Zaobilazno rješenje',
  },
  en: {
    whatHappened: 'What happened',
    whoAffected: 'Who is affected',
    eta: 'ETA',
    workaround: 'Workaround',
  },
};

/** `null` when the value is not a supported broadcast language. */
export function toBroadcastTextLocale(value: string | null | undefined): BroadcastTextLocale | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.toLowerCase().slice(0, 2);
  return normalized === 'bs' || normalized === 'en' ? normalized : null;
}

/**
 * Validates the broadcast input and returns the field values, so the exact same
 * parts can be rendered once for the ticket and again per recipient language.
 */
export function collectBulkBroadcastParts(
  body: ExecuteTicketBulkInput,
  configuration: TicketBulkConfiguration,
): BulkBroadcastParts {
  if (!configuration.broadcastEnableInApp && !configuration.broadcastEnableEmail) {
    throw new TicketsError('BULK_BROADCAST_INVALID');
  }
  const fields: Record<string, string | undefined> = {
    what_happened: body.whatHappened,
    who_affected: body.whoAffected,
    eta: body.eta,
  };
  if (configuration.broadcastStructuredEnabled) {
    for (const key of configuration.broadcastRequiredFields) {
      if ((fields[key] ?? '').trim().length === 0) {
        throw new TicketsError('BULK_BROADCAST_INVALID');
      }
    }
  }
  return {
    whatHappened: (body.whatHappened ?? '').trim(),
    whoAffected: (body.whoAffected ?? '').trim(),
    eta: (body.eta ?? '').trim(),
    workaround: configuration.broadcastAllowWorkaround
      ? body.workaround?.trim() ?? ''
      : null,
  };
}

/** Renders the parts as the labelled, plain-text broadcast body. */
export function formatBulkBroadcastText(
  parts: BulkBroadcastParts,
  locale: BroadcastTextLocale = 'bs',
): string {
  const labels = broadcastLabels[locale];
  return [
    `${labels.whatHappened}: ${parts.whatHappened}`,
    `${labels.whoAffected}: ${parts.whoAffected}`,
    `${labels.eta}: ${parts.eta}`,
    parts.workaround === null || parts.workaround.length === 0
      ? null
      : `${labels.workaround}: ${parts.workaround}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * Validates the input and returns both the parts (for a re-render in another
 * language) and the rendered text; throws `BULK_BROADCAST_INVALID` like before.
 */
export function prepareBulkBroadcastMessage(
  body: ExecuteTicketBulkInput,
  configuration: TicketBulkConfiguration,
  locale: BroadcastTextLocale = 'bs',
): { readonly parts: BulkBroadcastParts; readonly text: string } {
  const parts = collectBulkBroadcastParts(body, configuration);
  const text = formatBulkBroadcastText(parts, locale);
  if (!configuration.broadcastAllowLinks && containsLink(text)) {
    throw new TicketsError('BULK_BROADCAST_INVALID');
  }
  if (text.trim().length === 0) {
    throw new TicketsError('BULK_BROADCAST_INVALID');
  }
  return { parts, text };
}

export function formatBulkBroadcastMessage(
  body: ExecuteTicketBulkInput,
  configuration: TicketBulkConfiguration,
  locale: BroadcastTextLocale = 'bs',
): string {
  return prepareBulkBroadcastMessage(body, configuration, locale).text;
}

function containsLink(value: string): boolean {
  return /https?:\/\//i.test(value) || /www\./i.test(value);
}
