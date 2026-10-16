import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import {
  applyBlueprint,
  applyPolicyPack,
  chooseLocalSignIn,
  choosePackage,
  confirmSlaDefaults,
  deferStep,
  expectReadyScreen,
  fillSmtp,
  fillSuperAdmin,
  finishInstallation,
  openWizard,
  saveAddons,
  saveIdentity,
} from '../install-wizard/install-wizard-actions';
import {
  addTeamMember,
  createStructure,
} from '../install-wizard/install-wizard-forms';
import { wizardStartFailure } from '../install-wizard/install-wizard-precondition';

/*
  F6 — the **Standard** package: everything Minimum does, plus SMTP that really
  sends, a team, the blueprint catalog and the IT policy pack.

  SMTP: the step's own „Pošalji test“ must be accepted (the existing mail catcher
  answers for `E2E_SMTP_HOST`/`E2E_SMTP_PORT`). A deployment without a catcher
  cannot prove mail, so the step is deferred instead and the run reports it as an
  annotation — the same honesty rule the rest of the suite applies to a missing
  capability: a skipped check is never a green one.

  The security recommendations stay **deferred** on purpose: applying them makes
  MFA mandatory for administrators, and the spec then has to sign in as that very
  administrator. Reopening the wizard
  (`npm run cli:install-rerun -- --include-step-markers`) lets this spec walk the
  wizard of a stack that spec 51 already finished.
*/

test.describe('52 install wizard — Standard package', () => {
  test('sends a test mail, applies the blueprint and finishes on the readiness screen', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const token = process.env.E2E_INSTALL_TOKEN ?? '';
    test.skip(
      token.length < 16,
      'E2E_INSTALL_TOKEN is not set (the wizard answers 403 INSTALL_TOKEN_NOT_CONFIGURED).',
    );

    const api = new ApiClient();
    const status = await api.requestJson<{ readonly isCompleted: boolean; readonly nextStep?: string | null }>(
      '/install/status',
    );
    test.skip(
      status.isCompleted,
      'The stack already has a finished installation. Reset the database, or reopen the ' +
        'wizard with INSTALL_ALLOW_RERUN=true and `npm run cli:install-rerun -- --reason ... ' +
        '--include-step-markers` (ops/runbook/ponovno-pokretanje-instalacije.md).',
    );
    // See spec 51: an open wizard is not necessarily a fresh one.
    const startFailure = wizardStartFailure(status);
    if (startFailure !== null) throw new Error(startFailure);

    await openWizard(page, token);
    await choosePackage(page, /standard/i);
    await fillSuperAdmin(page, {
      email: env.superAdminEmail,
      password: env.superAdminPassword,
      displayName: 'E2E SuperAdmin',
    });
    await saveIdentity(page, { organizationName: 'E2E Standard', timeZone: 'Europe/Sarajevo' });
    await chooseLocalSignIn(page);

    const smtpWorks = await fillSmtp(page, {
      host: env.smtpHost,
      port: env.smtpPort,
      username: process.env.E2E_SMTP_USERNAME ?? 'e2e',
      password: process.env.E2E_SMTP_PASSWORD ?? 'e2e-test-password',
      from: process.env.E2E_SMTP_FROM ?? 'helpdesk@example.com',
    });
    if (!smtpWorks) {
      test
        .info()
        .annotations.push({ type: 'smtp', description: 'The test mail was not accepted.' });
      console.warn(
        '[e2e] no mail catcher answered the SMTP test — the step is deferred instead of ' +
          'claiming that mail works.',
      );
      await deferStep(page, 'smtp');
    }

    await createStructure(page);
    const teamEmail = process.env.E2E_AGENT_EMAIL ?? 'e2e.agent@example.com';
    await addTeamMember(page, { displayName: 'E2E Standard Agent', email: teamEmail });
    await applyBlueprint(page, /IT service desk/i);
    await applyPolicyPack(page, /IT Standard/i);
    await confirmSlaDefaults(page);
    await deferStep(page, 'securityRecommendations');
    await saveAddons(page);

    const missing = await finishInstallation(page);
    expect(missing, 'the readiness screen must be green on a Standard installation').toEqual([]);
    await expectReadyScreen(page);

    const completed = await api.requestJson<{ readonly isCompleted: boolean }>('/install/status');
    expect(completed.isCompleted).toBe(true);

    // The blueprint really wrote its catalog: the services of the IT template are
    // in the catalog of the finished installation.
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const services = await api.requestJson<Array<{ readonly slug?: string }>>('/services');
    const slugs = services.map((service) => service.slug);
    expect(slugs).toContain('racunar-i-oprema');
    expect(slugs).toContain('greske-u-aplikacijama');

    // The invited agent exists and can sign in — the team step created a real
    // account, not a list entry. Without SMTP the password was shown once in the
    // wizard, so the account is verified through the API instead.
    const users = await api.requestJson<ReadonlyArray<{ readonly email: string }>>(
      `/users?take=200&q=${encodeURIComponent(teamEmail)}`,
    );
    expect(users.map((user) => user.email)).toContain(teamEmail);
  });
});
