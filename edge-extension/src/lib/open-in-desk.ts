export function openDeskUrl(deskPublicUrl: string, ticketId?: string | null): void {
  const base = deskPublicUrl.replace(/\/$/, '');
  if (base.length === 0) {
    return;
  }
  const url =
    typeof ticketId === 'string' && ticketId.length > 0
      ? `${base}/tickets/${ticketId}`
      : base;
  void chrome.tabs.create({ url });
}
