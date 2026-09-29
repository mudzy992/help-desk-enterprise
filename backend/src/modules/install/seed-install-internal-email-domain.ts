import { Logger } from '@nestjs/common';
import { notificationEmailSettings } from '../settings/definitions/notification-email-settings';
import { settingKeys } from '../settings/setting-keys';
import type { InstallSettingsWriteTransaction } from './install-complete.types';
import { upsertInstallSetting } from './upsert-install-setting';

const logger = new Logger('InstallInternalEmailDomain');

/**
 * Internal e-mail domains are a setting, not a constant. On a fresh install
 * the super admin's domain becomes the first internal domain, so restricted
 * delivery (`internalOnly`, on by default) reaches the organisation at once.
 * An existing value is never overwritten. Best effort: a failure here must
 * not block the installation; the admin can set the domain in Settings.
 */
export async function seedInstallInternalEmailDomain(
  store: InstallSettingsWriteTransaction,
  superAdminEmail: string,
): Promise<void> {
  const domain = superAdminEmail.trim().toLowerCase().split('@')[1] ?? '';
  if (domain.length === 0 || !domain.includes('.')) return;
  const definition = notificationEmailSettings.find(
    (item) => item.key === settingKeys.privateNotificationsEmailInternalDomainsCsv,
  );
  if (definition === undefined) return;
  try {
    const existing = await store.appSetting.findUnique({ where: { key: definition.key }, select: { value: true } });
    if (typeof existing?.value === 'string' && existing.value.trim().length > 0) return;
    await upsertInstallSetting(store, definition, domain);
  } catch (error) {
    logger.warn(`install_internal_email_domain_seed_failed reason=${error instanceof Error ? error.message : String(error)}`);
  }
}
