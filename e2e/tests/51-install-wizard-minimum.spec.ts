import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';
import {
  choosePackage,
  chooseLocalSignIn,
  deferStep,
  expectReadyScreen,
  fillSuperAdmin,
  finishInstallation,
  openWizard,
  saveAddons,
  saveIdentity,
} from '../install-wizard/install-wizard-actions';
import { createStructure } from '../install-wizard/install-wizard-forms';
import { wizardStartFailure } from '../install-wizard/install-wizard-precondition';

/*
  F6 — the **Minimum** package, from the token gate to a real ticket.

  This is the acceptance flow of install wizard v2 (`07_phase-f6-zavrsetak-
  testovi.md`): everything happens in the wizard, nothing is finished through the
  API behind the operator's back. The installation is completed on the readiness
  screen (F6.1) and the ready screen (F6.2) hands the operator the sign-in link —
  no auto-login (owner decision 1).

  Requirements: an empty database (or an installation reopened with
  `INSTALL_ALLOW_RERUN=true` + `npm run cli:install-rerun -- --include-step-markers`),
  `E2E_INSTALL_TOKEN` = the deployment's `INSTALL_TOKEN`, and — for the token
  gate's own step — no session in the browser.

  SMTP and the team are **deferred** on purpose: the post-install checklist is
  supposed to show exactly what the operator left open, so this spec is also the
  fixture for that list.
*/

test.describe('51 install wizard — Minimum package', () => {
  test('walks the wizard, finishes on the readiness screen and files the first ticket', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const token = process.env.E2E_INSTALL_TOKEN ?? '';
    test.skip(
      token.length < 16,
      'E2E_INSTALL_TOKEN is not set (the wizard answers 403 INSTALL_TOKEN_NOT_CONFIGURED).',
    );

    const api = new ApiClient();
    const status = await api.requestJson<{
      readonly isCompleted: boolean;
      readonly profile?: string | null;
      readonly nextStep?: string | null;
    }>('/install/status');
    test.skip(
      status.isCompleted,
      'The stack already has a finished installation. Reset the database, or reopen the ' +
        'wizard with INSTALL_ALLOW_RERUN=true and `npm run cli:install-rerun -- --reason ... ' +
        '--include-step-markers` (ops/runbook/ponovno-pokretanje-instalacije.md).',
    );
    // Open is not the same as fresh: a reopened installation keeps its answers, so
    // the wizard sits on the readiness screen. Failing with the command to fix it
    // beats the heading mismatch this used to produce (`expectStep(page, 'profile')`).
    const startFailure = wizardStartFailure(status);
    if (startFailure !== null) throw new Error(startFailure);

    await openWizard(page, token);
    // The cards render in package order (`minimum`, `standard`, `full`), so the
    // title of the first card that mentions it is the card that carries it.
    await choosePackage(page, /minimum/i);
    await fillSuperAdmin(page, {
      email: env.superAdminEmail,
      password: env.superAdminPassword,
      displayName: 'E2E SuperAdmin',
    });
    await saveIdentity(page, { organizationName: 'E2E Minimalna', timeZone: 'Europe/Sarajevo' });
    await chooseLocalSignIn(page);
    await deferStep(page, 'smtp');
    await createStructure(page);
    await deferStep(page, 'team');
    await saveAddons(page);

    const missing = await finishInstallation(page);
    expect(missing, 'the readiness screen must be green on a Minimum installation').toEqual([]);
    await expectReadyScreen(page);

    // F6.2 — the installation is finished, so the wizard is locked and the status
    // reports it; the ready screen never signs anybody in.
    const completed = await api.requestJson<{ readonly isCompleted: boolean }>('/install/status');
    expect(completed.isCompleted).toBe(true);

    // Owner decision 1: the operator signs in at `/login` themselves.
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await expect(page).not.toHaveURL(/\/install\b/);

    // F6.3 — the checklist names exactly the two steps this run deferred.
    await page.goto('/');
    await expect(
      page.getByText(/završite podešavanje|finish the setup/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/e-mail obavještenja su isključena|e-mail notifications are off/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/tim je samo superadmin|team is the superadmin alone/i).first(),
    ).toBeVisible();

    // The point of the whole flow: the installation receives a routed ticket.
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const ticket = await createTicketViaApi(api, {
      title: `E2E minimal install ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    expect(ticket.id.length).toBeGreaterThan(0);
    expect(ticket.assignedGroupId).not.toBeNull();
  });
});
