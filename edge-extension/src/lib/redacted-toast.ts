import { t } from '../i18n/ui-strings';

/**
 * OS toast — uvijek redacted.
 *
 * Po F9-1/F9-2 matricama toast nikad ne prikazuje `title`/`body` s backend
 * notifikacije: samo lokaliziran neutralan naslov po tipu + identifikator
 * tiketa (broj tiketa kad ga backend pošalje, inače skraćeni ticketId).
 */

export type RedactedToastInput = {
  readonly eventId: string;
  readonly type: string;
  readonly ticketId: string | null;
  readonly ticketNumber?: string | null;
  readonly serviceName?: string;
};

function toastTitleFor(type: string): string {
  if (type === 'remote.requested') {
    return t('toastRemoteTitle');
  }
  if (type.includes('sla')) {
    return t('toastSlaTitle');
  }
  if (type.includes('message')) {
    return t('toastMessageTitle');
  }
  if (type.startsWith('ticket.')) {
    return t('toastTicketEventTitle');
  }
  return t('toastGenericTitle');
}

function toastMessageFor(input: RedactedToastInput): string {
  if (input.type === 'remote.requested') {
    return t('toastRemoteBody');
  }
  if (typeof input.ticketNumber === 'string' && input.ticketNumber.length > 0) {
    return input.ticketNumber;
  }
  if (typeof input.serviceName === 'string' && input.serviceName.length > 0) {
    return input.serviceName;
  }
  if (input.ticketId !== null && input.ticketId.length > 0) {
    return `…${input.ticketId.slice(-6)}`;
  }
  return 'EP-HelpDesk';
}

export async function showRedactedToast(
  input: RedactedToastInput,
): Promise<void> {
  const isRemote = input.type === 'remote.requested';
  try {
    await chrome.notifications.create(input.eventId, {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: toastTitleFor(input.type),
      message: toastMessageFor(input),
      contextMessage: 'EP-HelpDesk',
      priority: isRemote ? 2 : 0,
      requireInteraction: isRemote,
      buttons: [{ title: t('toastOpenInDesk') }],
    });
  } catch {
    // OS može odbiti toast (npr. Focus Assist) — ne smije srušiti SW.
  }
}

export async function clearToast(eventId: string): Promise<void> {
  try {
    await chrome.notifications.clear(eventId);
  } catch {
    // Ignorirano.
  }
}
