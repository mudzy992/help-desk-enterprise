import type { Page } from '@playwright/test';
import type { ApiClient } from './api-client';

type ActiveAnnouncement = {
  readonly id: string;
  readonly requiresAcknowledgement: boolean;
};

type ActiveResponse = {
  readonly enabled?: boolean;
  readonly announcements?: readonly ActiveAnnouncement[];
};

type ManagedAnnouncement = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
};

/**
 * Clears every active announcement for the signed-in API session so UI tests
 * are not blocked by modals left from an earlier spec or a failed run.
 */
export async function clearActiveAnnouncements(api: ApiClient): Promise<void> {
  const active = await api.requestJson<ActiveResponse>('/announcements/active');
  const items = active.announcements ?? [];
  for (const item of items) {
    const path = item.requiresAcknowledgement
      ? `/announcements/${encodeURIComponent(item.id)}/acknowledge`
      : `/announcements/${encodeURIComponent(item.id)}/dismiss`;
    await api.request(path, { method: 'POST' });
  }
}

/** Withdraws published E2E najave so they stop targeting the whole audience. */
export async function withdrawPublishedE2eAnnouncements(api: ApiClient): Promise<void> {
  const list = await api.requestJson<{ readonly announcements: readonly ManagedAnnouncement[] }>(
    '/announcements/manage',
  );
  for (const item of list.announcements) {
    if (item.status !== 'PUBLISHED') continue;
    if (!/^E2E\s/i.test(item.title)) continue;
    await api.requestJson(`/announcements/manage/${encodeURIComponent(item.id)}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'E2E global setup cleanup' }),
    });
  }
}

/**
 * Dismisses announcement UI (modal or banner) that would intercept pointer events.
 * Safe to call after navigation; loops until no known control is visible.
 */
export async function dismissAnnouncementModal(page: Page): Promise<void> {
  const later = page.getByRole('button', { name: /^(kasnije|later)$/i });
  const bannerDismiss = page.getByRole('button', { name: /^zatvori$/i });
  const acknowledge = page.getByRole('button', {
    name: /pročitao\/la sam|i have read|acknowledge/i,
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const laterVisible = await later
      .waitFor({ state: 'visible', timeout: attempt === 0 ? 8_000 : 1_500 })
      .then(() => true)
      .catch(() => false);
    if (laterVisible) {
      await later.click();
      await later.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => undefined);
      continue;
    }

    if (await acknowledge.isVisible().catch(() => false)) {
      await acknowledge.click();
      await acknowledge.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => undefined);
      continue;
    }

    if (await bannerDismiss.isVisible().catch(() => false)) {
      await bannerDismiss.click();
      await bannerDismiss.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
      continue;
    }

    return;
  }
}

export async function gotoAndDismissAnnouncements(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await dismissAnnouncementModal(page);
}
