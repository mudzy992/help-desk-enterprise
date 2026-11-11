import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Health = {
  readonly components: {
    readonly email: {
      readonly lastSentAt: string | null;
      /** Val 3 (M12/B1): rows stuck in CLAIMED; reclaimed after 10 minutes. */
      readonly stuckClaims?: number | null;
    };
  };
};

type ChannelResult = {
  readonly channel: string;
  readonly status: string;
  readonly delivered: number;
  readonly failed: number;
  readonly reason: string | null;
};

type Notification = {
  readonly id: string;
  readonly type: string;
  readonly isRead: boolean;
};

async function notifications(api: ApiClient): Promise<readonly Notification[]> {
  const body = await api.requestJson<{ items: Notification[] } | Notification[]>('/notifications?limit=50');
  return Array.isArray(body) ? body : body.items;
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 30_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > until) throw new Error(`poll timed out, last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    value = await read();
  }
  return value;
}

/**
 * Val 5 (M12 e2e coverage). The outbound e-mail path was covered only by unit
 * tests and the templates spec: this spec pins the contract of the ops "send
 * test alarm" endpoint per channel (e-mail included), the `components.email`
 * block that the health tile reads (last sent + stuck claims, M12 B1) and the
 * read/unread contract of the delivered in-app alarm. Real SMTP delivery stays
 * optional: when the channel is disabled the endpoint must say so with a
 * known reason instead of failing.
 */
test.describe('36 outbound e-mail and notification delivery', () => {
  test('the health payload and the test alarm expose the e-mail channel', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);

    const health = await admin.requestJson<Health>('/ops/health');
    const email = health.components.email;
    expect(email).toBeDefined();
    expect(email.lastSentAt === null || Number.isFinite(Date.parse(email.lastSentAt))).toBe(true);
    // The counter always exists; a positive value is what turns the tile into "warning".
    expect(Number.isInteger(email.stuckClaims ?? 0)).toBe(true);
    expect(email.stuckClaims ?? 0).toBeGreaterThanOrEqual(0);

    const result = await admin.requestJson<{ channels: ChannelResult[] }>('/ops/alerts/test', {
      method: 'POST',
      body: '{}',
    });
    const emailChannel = result.channels.find((channel) => channel.channel === 'email');
    const inApp = result.channels.find((channel) => channel.channel === 'inApp');
    expect(emailChannel, JSON.stringify(result.channels)).toBeDefined();
    expect(['sent', 'partial', 'failed', 'skipped']).toContain(emailChannel?.status);
    expect(inApp?.status, JSON.stringify(result.channels)).toBe('sent');
    if (emailChannel?.status === 'skipped') {
      // Without a configured transport the answer must name a known reason, not fail.
      expect(['email_channel_disabled', 'no_recipients', 'not_configured']).toContain(emailChannel.reason);
    }
    if (emailChannel?.status === 'sent' || emailChannel?.status === 'partial') {
      expect(emailChannel.delivered).toBeGreaterThan(0);
    }

    const delivered = await poll(
      () => notifications(admin),
      (items) => items.some((item) => item.type === 'ops.alert'),
    );
    const alarm = delivered.find((item) => item.type === 'ops.alert');
    expect(alarm).toBeDefined();

    const before = await admin.requestJson<{ unreadCount: number }>('/notifications/unread-count');
    const updated = await admin.requestJson<Notification>(`/notifications/${alarm?.id}/read`, { method: 'POST' });
    expect(updated.id).toBe(alarm?.id);
    expect(updated.isRead).toBe(true);
    const after = await admin.requestJson<{ unreadCount: number }>('/notifications/unread-count');
    expect(after.unreadCount).toBeLessThanOrEqual(before.unreadCount);
  });

  test('the ops card shows the e-mail tile and reports the test alarm channels', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/admin?tab=ops');
    const card = page.getByTestId('ops-health-card');
    await expect(card).toBeVisible({ timeout: 30_000 });

    // M12 B1: the tile reads `components.email` and speaks its three states;
    // their wording is unique to this tile, so the card-level match is exact.
    await expect(card.getByText(/Slanje e-maila|Outgoing e-mail/)).toBeVisible();
    await expect(
      card.getByText(
        /Još nije poslan nijedan e-mail|No e-mail sent yet|Posljednji poslan|Last sent|Zaglavljeno u redu|Stuck in the queue/,
      ),
    ).toBeVisible();

    await card.getByRole('button', { name: /Pošalji testni alarm|Send test alarm/ }).click();
    // The toast lists every channel with its status; the e-mail line must be there.
    await expect(page.getByText(/E-mail: /).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Testni alarm|Test alarm/).first()).toBeVisible();
  });
});
