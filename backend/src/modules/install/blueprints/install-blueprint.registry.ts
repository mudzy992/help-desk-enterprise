import { policyPackKeys } from '../../policy-packs/policy-pack.constants';
import type { InstallBlueprint } from './install-blueprint.types';

/**
 * Install wizard v2 (F4.2): the first blueprint — an IT service desk. Five
 * categories and ten request types, which is what the Standard package promises
 * („katalog iz predloška“) and what the overview §4 calls „Katalog servisa iz
 * predloška“.
 *
 * Rows are found by **slug**, so a repeated apply never duplicates anything and
 * an installation that already went through the F2 structure step keeps its own
 * „Opšte / Opšti zahtjev“ (slug `opsti-zahtjev`) instead of gaining a twin.
 */
export const installBlueprintKeys = {
  itServiceDesk: 'itServiceDesk',
} as const;

const itServiceDesk: InstallBlueprint = {
  key: installBlueprintKeys.itServiceDesk,
  names: {
    bs: 'IT service desk',
    en: 'IT service desk',
  },
  slaProfileKey: 'STANDARD_REQUEST',
  // The pack ids come from the policy-packs registry, never from a literal here.
  policyPackKeys: [policyPackKeys.itStandard],
  categories: [
    {
      key: 'hardware',
      names: { bs: 'Hardver', en: 'Hardware' },
      slug: 'hardver',
      services: [
        {
          key: 'computerEquipment',
          names: {
            bs: 'Računar i oprema',
            en: 'Computer and equipment',
          },
          slug: 'racunar-i-oprema',
        },
        {
          key: 'printersPeripherals',
          names: {
            bs: 'Štampači i periferije',
            en: 'Printers and peripherals',
          },
          slug: 'stampaci-i-periferije',
        },
      ],
    },
    {
      key: 'software',
      names: { bs: 'Softver', en: 'Software' },
      slug: 'softver',
      services: [
        {
          key: 'softwareLicences',
          names: {
            bs: 'Instalacija i licence',
            en: 'Installation and licences',
          },
          slug: 'instalacija-i-licence',
        },
        {
          key: 'applicationErrors',
          names: {
            bs: 'Greške u aplikacijama',
            en: 'Application errors',
          },
          slug: 'greske-u-aplikacijama',
        },
      ],
    },
    {
      key: 'accessAccounts',
      names: { bs: 'Pristup i nalozi', en: 'Access and accounts' },
      slug: 'pristup-i-nalozi',
      services: [
        {
          key: 'accountManagement',
          names: {
            bs: 'Kreiranje i izmjena naloga',
            en: 'Account creation and changes',
          },
          slug: 'kreiranje-i-izmjena-naloga',
        },
        {
          key: 'systemAccess',
          names: {
            bs: 'Pristup sistemima',
            en: 'System access',
          },
          slug: 'pristup-sistemima',
        },
      ],
    },
    {
      key: 'network',
      names: { bs: 'Mreža', en: 'Network' },
      slug: 'mreza',
      services: [
        {
          key: 'networkConnectivity',
          names: {
            bs: 'Mrežna veza i Wi-Fi',
            en: 'Network connection and Wi-Fi',
          },
          slug: 'mrezna-veza-i-wifi',
        },
        {
          key: 'vpnRemoteAccess',
          names: {
            bs: 'VPN i udaljeni pristup',
            en: 'VPN and remote access',
          },
          slug: 'vpn-i-udaljeni-pristup',
        },
      ],
    },
    {
      key: 'general',
      names: { bs: 'Opšte', en: 'General' },
      slug: 'opste',
      services: [
        {
          key: 'generalRequest',
          names: {
            bs: 'Opšti zahtjev',
            en: 'General request',
          },
          slug: 'opsti-zahtjev',
        },
        {
          key: 'otherQuestions',
          names: {
            bs: 'Ostala pitanja',
            en: 'Other questions',
          },
          slug: 'ostala-pitanja',
        },
      ],
    },
  ],
  tierGroups: [
    {
      key: 'tier1',
      names: { bs: 'Nivo 1 podrška', en: 'Tier 1 support' },
      groupKey: 'nivo-1',
      level: 1,
    },
    {
      key: 'tier2',
      names: { bs: 'Nivo 2 podrška', en: 'Tier 2 support' },
      groupKey: 'nivo-2',
      level: 2,
    },
  ],
};

export const installBlueprints: readonly InstallBlueprint[] = [itServiceDesk];

export function listInstallBlueprints(): readonly InstallBlueprint[] {
  return installBlueprints;
}

export function getInstallBlueprint(
  blueprintKey: string,
): InstallBlueprint | null {
  const key = blueprintKey.trim();
  if (key.length === 0) {
    return null;
  }
  return installBlueprints.find((entry) => entry.key === key) ?? null;
}

/** Request-type keys of a blueprint, in the order the UI shows them. */
export function listInstallBlueprintServiceKeys(
  blueprint: InstallBlueprint,
): readonly string[] {
  return blueprint.categories.flatMap((category) =>
    category.services.map((service) => service.key),
  );
}
