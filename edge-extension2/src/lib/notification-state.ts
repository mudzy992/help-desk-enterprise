const key = 'notificationState';

export type NotificationState = {
  unread: number;
  actionRequired: number;
};

const emptyState: NotificationState = {
  unread: 0,
  actionRequired: 0,
};

export async function readNotificationState(): Promise<NotificationState> {
  const stored = await chrome.storage.session.get(key);

  const value = stored[key] as
    | Partial<NotificationState>
    | undefined;

  return {
    unread:
      typeof value?.unread === 'number'
        ? Math.max(0, value.unread)
        : 0,

    actionRequired:
      typeof value?.actionRequired === 'number'
        ? Math.max(0, value.actionRequired)
        : 0,
  };
}

export async function changeNotificationState(
  delta: {
    unread?: number;
    actionRequired?: number;
  },
): Promise<NotificationState> {
  const current = await readNotificationState();

  const next: NotificationState = {
    unread: Math.max(
      0,
      current.unread + (delta.unread ?? 0),
    ),

    actionRequired: Math.max(
      0,
      current.actionRequired + (delta.actionRequired ?? 0),
    ),
  };

  await chrome.storage.session.set({
    [key]: next,
  });

  await updateActionBadge(next);

  return next;
}

export async function resetNotificationState(): Promise<void> {
  await chrome.storage.session.set({
    [key]: emptyState,
  });

  await updateActionBadge(emptyState);
}

export async function updateActionBadge(
  state?: NotificationState,
): Promise<void> {
  const resolvedState =
    state ?? (await readNotificationState());

  const count = resolvedState.unread;

  await chrome.action.setBadgeText({
    text:
      count > 99
        ? '99+'
        : count > 0
          ? String(count)
          : '',
  });

  await chrome.action.setBadgeBackgroundColor({
    color:
      resolvedState.actionRequired > 0
        ? '#d92d20'
        : '#2563eb',
  });
}
