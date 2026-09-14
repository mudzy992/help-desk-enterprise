const pendingRemoteSessionKey = 'pendingRemoteTicketIds';

export async function rememberPendingRemote(ticketId: string): Promise<void> {
  const current = await readPendingRemoteTicketIds();
  if (current.includes(ticketId)) {
    return;
  }
  await chrome.storage.session.set({
    [pendingRemoteSessionKey]: [...current, ticketId],
  });
}

export async function forgetPendingRemote(ticketId: string): Promise<void> {
  const next = (await readPendingRemoteTicketIds()).filter(
    (id) => id !== ticketId,
  );
  await chrome.storage.session.set({ [pendingRemoteSessionKey]: next });
}

export async function mergePendingRemoteTicketIds(
  ticketIds: readonly string[],
): Promise<void> {
  const current = await readPendingRemoteTicketIds();
  await chrome.storage.session.set({
    [pendingRemoteSessionKey]: [...new Set([...current, ...ticketIds])],
  });
}

export async function readPendingRemoteTicketIds(): Promise<readonly string[]> {
  const stored = await chrome.storage.session.get(pendingRemoteSessionKey);
  const value = stored[pendingRemoteSessionKey];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

export async function clearPendingRemoteTicketIds(): Promise<void> {
  await chrome.storage.session.remove(pendingRemoteSessionKey);
}
