import { addonSettingKey } from '../../settings/addon-catalog';
import { settingKeys } from '../../settings/setting-keys';
import type { InstallSettingsSectionKey } from './install-settings-section.keys';

/**
 * Install wizard v2 (F5): what the Full package is allowed to read and write per
 * section. The wizard is **not** a second Settings screen — each section names a
 * short allowlist of the keys an operator really has to answer during an
 * installation; everything else stays in Settings, where the full prose and the
 * expert fields live.
 *
 * The allowlist is also the security boundary: `POST /install/sections/:key`
 * refuses any key outside it, so the wizard can never write a setting its section
 * does not own.
 */

/**
 * Something that has to exist before a section can do its job. The wizard reports
 * the state of every dependency, and `mainSwitchKey` of a bound section may not be
 * switched on while one is unmet (`INSTALL_SETTINGS_SECTION_DEPENDENCY_UNMET`) —
 * an on-call plan without a team, or e-mail tickets without a service to put them
 * in, would only look configured.
 */
export type InstallSettingsSectionDependency = 'service' | 'directoryLogin' | 'team';

export type InstallSettingsSectionDefinition = {
  readonly sectionKey: InstallSettingsSectionKey;
  readonly settingKeys: readonly string[];
  readonly requires: readonly InstallSettingsSectionDependency[];
  /**
   * The switch that turns the whole section on. Only meaningful together with
   * `requires`; the service refuses `true` for it while a dependency is unmet.
   */
  readonly mainSwitchKey?: string;
  /**
   * Keys whose missing value falls back to the package (`private.addons.*`):
   * Full switches CMDB, problems and changes on, so the section has to show the
   * package default and not the bare catalog default.
   */
  readonly packageDefaultKeys?: readonly string[];
};

export const installSettingsSections: readonly InstallSettingsSectionDefinition[] = [
  {
    sectionKey: 'inboundEmail',
    settingKeys: [
      settingKeys.privateInboundEnabled,
      settingKeys.privateInboundProvider,
      settingKeys.privateInboundAddress,
      settingKeys.privateInboundCreateTickets,
      settingKeys.privateInboundDefaultServiceId,
    ],
    requires: ['service'],
    mainSwitchKey: settingKeys.privateInboundEnabled,
  },
  {
    sectionKey: 'directory',
    // A directory read without a sign-in mode that uses it (owner decision 8: the
    // operator states whether AD/LDAPS exists) is dead configuration.
    settingKeys: [
      settingKeys.privateAuthAdReadEnabled,
      settingKeys.privateAuthAdReadStrategy,
      settingKeys.privateAuthAdReadUsersBaseDn,
      settingKeys.privateAuthAdReadGroupsBaseDn,
      settingKeys.privateAuthRoleSource,
      settingKeys.privateAuthAdRoleGroupDnAdmin,
      settingKeys.privateAuthAdRoleGroupDnAgent,
    ],
    requires: ['directoryLogin'],
    mainSwitchKey: settingKeys.privateAuthAdReadEnabled,
  },
  {
    sectionKey: 'knowledgeBase',
    settingKeys: [
      settingKeys.privateKnowledgeBaseFeedbackEnabled,
      settingKeys.privateKnowledgeBaseReviewCycleEnabled,
      settingKeys.privateKnowledgeBasePortalFaqMaxItems,
    ],
    requires: [],
  },
  {
    sectionKey: 'statusPage',
    settingKeys: [
      settingKeys.privateStatusPageEnabled,
      settingKeys.privateStatusPagePublic,
      settingKeys.privateStatusPageShowUptimePercent,
    ],
    requires: [],
  },
  {
    sectionKey: 'onCall',
    settingKeys: [settingKeys.privateOnCallEnabled, settingKeys.privateOnCallReminderTime],
    requires: ['team'],
    mainSwitchKey: settingKeys.privateOnCallEnabled,
  },
  {
    sectionKey: 'announcements',
    settingKeys: [
      settingKeys.privateAnnouncementsEnabled,
      settingKeys.privateAnnouncementsAgentsMayPublish,
    ],
    requires: [],
  },
  {
    sectionKey: 'security',
    settingKeys: [
      settingKeys.privateAuthMfaRequiredForAdmins,
      settingKeys.privateAuthMfaAllowOptional,
      settingKeys.privateSecurityHibpEnabled,
      settingKeys.privateSecuritySessionIdleTimeoutSeconds,
      settingKeys.privateSecurityCaptchaProvider,
      settingKeys.privateSecurityCaptchaSiteKey,
      settingKeys.privateSecurityCaptchaSecretKey,
    ],
    requires: [],
  },
  {
    sectionKey: 'privacy',
    settingKeys: [
      settingKeys.privatePrivacyEnabled,
      settingKeys.privateDataLifecycleArchiveEnabled,
      settingKeys.privateDataLifecycleArchiveAfterClosedDays,
    ],
    requires: [],
  },
  {
    sectionKey: 'auditWebhook',
    settingKeys: [
      settingKeys.privateSecurityAuditWebhookEnabled,
      settingKeys.privateSecurityAuditWebhookUrl,
      settingKeys.privateSecurityAuditWebhookSecret,
    ],
    requires: [],
  },
  {
    sectionKey: 'itsm',
    // Only the module switches: number prefixes, quorums and freeze periods are
    // day-to-day configuration and stay on the problem/change screens.
    settingKeys: [addonSettingKey('cmdb'), addonSettingKey('problems'), addonSettingKey('changes')],
    requires: [],
    packageDefaultKeys: [
      addonSettingKey('cmdb'),
      addonSettingKey('problems'),
      addonSettingKey('changes'),
    ],
  },
  {
    sectionKey: 'integrations',
    settingKeys: [
      addonSettingKey('teams'),
      addonSettingKey('edge'),
      // The one operational choice the connector cannot work without: simulator
      // for a pilot, live for Microsoft 365.
      settingKeys.privateIntegrationsTeamsMode,
    ],
    requires: [],
    packageDefaultKeys: [addonSettingKey('teams'), addonSettingKey('edge')],
  },
];

export const installSettingsSectionByKey: Readonly<
  Record<InstallSettingsSectionKey, InstallSettingsSectionDefinition>
> = Object.fromEntries(
  installSettingsSections.map((section) => [section.sectionKey, section]),
) as Record<InstallSettingsSectionKey, InstallSettingsSectionDefinition>;

export function findInstallSettingsSection(
  sectionKey: string,
): InstallSettingsSectionDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(installSettingsSectionByKey, sectionKey)
    ? installSettingsSectionByKey[sectionKey as InstallSettingsSectionKey]
    : undefined;
}
