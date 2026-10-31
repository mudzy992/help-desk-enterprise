import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';

type EscalationRule = { readonly id: string; readonly slaProfileId: string };

test.describe('50 SLA escalations', () => {
  test('deletion requires an audit reason', async () => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const profiles = await api.requestAllPages<{ id: string }>('/sla/profiles');
    const profile = profiles[0];
    expect(profile, 'a seeded SLA profile').toBeDefined();

    // Earlier runs can fill the profile up to maxEscalationLevels; make room.
    const existing = await api.requestAllPages<EscalationRule>(
      `/sla/escalation-rules?slaProfileId=${encodeURIComponent(profile!.id)}`,
    );
    for (const rule of existing) {
      await api
        .request(`/sla/escalation-rules/${rule.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason: 'E2E make room before escalation create' }),
        })
        .catch(() => undefined);
    }

    const rule = await api.requestJson<{ id: string }>('/sla/escalation-rules', {
      method: 'POST',
      body: JSON.stringify({
        slaProfileId: profile!.id,
        triggerOffsetMinutes: 15,
        targetRole: 'ADMIN',
        reason: 'E2E escalation creation',
      }),
    });
    try {
      const rejected = await api.request(`/sla/escalation-rules/${rule.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: '' }),
      });
      expect(rejected.ok).toBe(false);
      const removed = await api.request(`/sla/escalation-rules/${rule.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'E2E escalation cleanup' }),
      });
      expect(removed.ok).toBe(true);
    } finally {
      await api
        .request(`/sla/escalation-rules/${rule.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason: 'E2E fallback cleanup' }),
        })
        .catch(() => undefined);
    }
  });
});
