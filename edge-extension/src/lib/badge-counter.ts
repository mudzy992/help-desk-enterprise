/**
 * Toolbar badge — broj nepročitanih notifikacija.
 * Limit 99+ radi čitljivosti; negativne/N aN vrijednosti se tretiraju kao 0.
 */
const badgeColor = '#2563eb';

let lastCount = 0;

export async function updateUnreadBadge(unreadCount: number): Promise<void> {
  const normalized = Number.isFinite(unreadCount)
    ? Math.max(0, Math.floor(unreadCount))
    : 0;
  lastCount = normalized;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    await chrome.action.setBadgeText({
      text: normalized === 0 ? '' : normalized > 99 ? '99+' : String(normalized),
    });
  } catch {
    // Badge je kosmetika — nikad ne ruši SW.
  }
}

export function currentUnreadBadge(): number {
  return lastCount;
}

export async function clearUnreadBadge(): Promise<void> {
  await updateUnreadBadge(0);
}
