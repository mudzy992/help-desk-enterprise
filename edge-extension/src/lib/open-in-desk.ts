export function openDeskUrl(deskPublicUrl: string, ticketId?: string | null): void {
  const base = deskPublicUrl.replace(/\/+$/, '');
  if (base.length === 0) {
    // APP_PUBLIC_URL nije podešen na backendu — tihi no-op (popup površina
    // stanje prikazuje korisniku prije klika).
    return;
  }
  const url =
    typeof ticketId === 'string' && ticketId.length > 0
      ? `${base}/tickets/${encodeURIComponent(ticketId)}`
      : base;
  void chrome.tabs.create({ url });
}
