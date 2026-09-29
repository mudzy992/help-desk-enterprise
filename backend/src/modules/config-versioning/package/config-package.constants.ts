/**
 * Paket 2.9 (K4): portable configuration package between environments
 * (staging → production). See docs/plans/modules/2.9-dodatne-nadogradnje.md §5.
 */
export const configPackageFormat = 'helpdesk-config-package';
export const configPackageFormatVersion = 1;
/** Upload hard limit for `POST /config-versions/import`. */
export const configPackageMaxBytes = 5 * 1024 * 1024;

/**
 * Settings that describe *this* installation rather than how the help desk
 * works: identity provider, mail transport and mailbox, install markers,
 * integration endpoints, the edge extension pairing, operational switches
 * (maintenance, read-only) and ops alert channels. They are exported only when
 * the operator ticks "include environment-bound settings", and imported only
 * when the importer confirms it again. Secrets are never exported.
 */
export const environmentBoundSettingPrefixes: readonly string[] = [
  'private.auth.',
  'private.smtp.',
  'private.inbound.',
  'private.install.',
  'private.integrations.',
  'private.edgeExtension.',
  'private.ops.',
  'private.readOnlyMode.',
  'private.statusPage.',
  'private.configVersioning.',
  'public.maintenance.',
];

export function isEnvironmentBoundSetting(key: string): boolean {
  return environmentBoundSettingPrefixes.some((prefix) => key.startsWith(prefix));
}

export const configPackageReferenceKinds = [
  'organizationalUnit',
  'group',
  'service',
  'serviceCategory',
  'policyPack',
  'formVersion',
  'responseTemplate',
  'playbook',
  'slaProfile',
  'calendar',
] as const;

export type ConfigPackageReferenceKind = (typeof configPackageReferenceKinds)[number];

/** Kinds an administrator may map by hand to an existing local entity. */
export const mappableReferenceKinds: readonly ConfigPackageReferenceKind[] = [
  'organizationalUnit',
  'group',
  'service',
  'serviceCategory',
  'policyPack',
];
