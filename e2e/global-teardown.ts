import { ApiClient } from './helpers/api-client';
import { readE2EEnvironment } from './helpers/environment';
import { restoreFormsSetting } from './helpers/forms-setting-recovery';
import { restoreOutboundEmailGate } from './helpers/outbound-email-gate';
import { existsSync } from 'node:fs';

export default async function globalTeardown(): Promise<void> {
  // Each journal is restored on its own: a run that never touched the forms
  // setting must still put the e-mail channel back.
  const formsJournal = process.env.E2E_FORMS_RECOVERY_JOURNAL;
  const emailJournal = process.env.E2E_EMAIL_GATE_JOURNAL;
  const hasForms = formsJournal !== undefined && existsSync(formsJournal);
  const hasEmail = emailJournal !== undefined && existsSync(emailJournal);
  if (!hasForms && !hasEmail) return;
  const env = readE2EEnvironment();
  const api = new ApiClient();
  await api.login(env.superAdminEmail, env.superAdminPassword);
  if (hasForms) await restoreFormsSetting(api);
  if (hasEmail) await restoreOutboundEmailGate(api);
}
