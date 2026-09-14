export type RedactedToastInput = {
  readonly eventId: string;
  readonly type: string;
  readonly ticketId: string | null;
  readonly serviceName?: string;
};

export function buildRedactedToast(input: RedactedToastInput): {
  readonly title: string;
  readonly message: string;
} {
  const ticket = input.ticketId === null ? '' : input.ticketId;
  const service =
    typeof input.serviceName === 'string' && input.serviceName.length > 0
      ? ` · ${input.serviceName}`
      : '';
  return {
    title: input.type,
    message: ticket.length === 0 ? 'HelpDesk' : `${ticket}${service}`,
  };
}

export async function showRedactedToast(input: RedactedToastInput): Promise<void> {
  const toast = buildRedactedToast(input);
  await chrome.notifications.create(input.eventId, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: toast.title,
    message: toast.message,
    priority: 1,
  });
}
