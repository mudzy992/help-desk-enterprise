/**
 * Install wizard v2 (F4.2): a blueprint is the declarative answer to „what does a
 * finished service desk look like“ — categories, request types, optional support
 * tiers and the policy pack that belongs to them. Modelled after
 * `policy-packs/policy-pack.registry.ts`: data, never behaviour.
 *
 * Names are localized inside the registry (`names.bs` / `names.en`) and the apply
 * request carries the locale the operator is reading. The plan's `nameKey` is
 * realized as that pair: a category or service row stores exactly one name, and
 * the UI must show the same string the installer writes — one source, no drift.
 */
export type InstallBlueprintLocale = 'bs' | 'en';

export const installBlueprintLocales: readonly InstallBlueprintLocale[] = [
  'bs',
  'en',
];

export type InstallBlueprintNames = Readonly<
  Record<InstallBlueprintLocale, string>
>;

export type InstallBlueprintServiceDefinition = {
  /** Stable id used by `includeServices` and by the UI tree. */
  readonly key: string;
  readonly names: InstallBlueprintNames;
  readonly slug: string;
};

export type InstallBlueprintCategoryDefinition = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  readonly slug: string;
  readonly services: readonly InstallBlueprintServiceDefinition[];
};

export type InstallBlueprintTierGroupDefinition = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  /** Stable `group.key`; only the display name follows the locale. */
  readonly groupKey: string;
  readonly level: 1 | 2;
};

export type InstallBlueprint = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  /** SLA profile every request type of this blueprint starts under. */
  readonly slaProfileKey: string;
  /**
   * Policy packs the wizard offers next to this blueprint (F4.3), in the order
   * the step shows them; the first one is the default. F4.3 (open question 3):
   * `hrRestricted` / `financeRestricted` are only offered by a blueprint that
   * actually contains HR or finance request types — the IT blueprint offers the
   * IT pack, and a future HR blueprint would list the restricted pack here.
   */
  readonly policyPackKeys: readonly string[];
  readonly categories: readonly InstallBlueprintCategoryDefinition[];
  readonly tierGroups: readonly InstallBlueprintTierGroupDefinition[];
};

export type InstallBlueprintCatalog = {
  readonly locale: InstallBlueprintLocale;
  /** Blueprint applied earlier in this installation, if any. */
  readonly applied: string | null;
  readonly blueprints: readonly InstallBlueprint[];
};

export type InstallBlueprintApplyInput = {
  readonly blueprintKey: string;
  /** Request-type keys to create; omitted means every service of the blueprint. */
  readonly includeServices?: readonly string[];
  readonly createTierGroups?: boolean;
  readonly locale?: InstallBlueprintLocale;
};

export type InstallBlueprintAppliedService = {
  readonly key: string;
  readonly categoryKey: string;
  readonly serviceId: string;
  readonly name: string;
  readonly slug: string;
  readonly created: boolean;
  /** Routing rule (origin unit → tier/handler group) exists for this service. */
  readonly routed: boolean;
};

export type InstallBlueprintApplyResult = {
  readonly blueprintKey: string;
  readonly locale: InstallBlueprintLocale;
  readonly createdCategoryCount: number;
  readonly createdServiceCount: number;
  readonly existingServiceCount: number;
  readonly createdTierGroupCount: number;
  readonly tierGroupKeys: readonly string[];
  readonly services: readonly InstallBlueprintAppliedService[];
};

export function isInstallBlueprintLocale(
  value: unknown,
): value is InstallBlueprintLocale {
  return (
    typeof value === 'string' &&
    installBlueprintLocales.includes(value as InstallBlueprintLocale)
  );
}
