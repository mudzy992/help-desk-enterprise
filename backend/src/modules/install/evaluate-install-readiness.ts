import type { InstallStepKey } from './steps/install-step.types';

/**
 * Install wizard v2 (F0.7): "ready for tickets" is a definition, not a feeling.
 * Every check from `00_overview.md` §3 (minus `profileSteps`, which needs the
 * step registry and is added in F1) is evaluated here as a pure function over
 * readers, so `POST /install/complete` and `GET /install/readiness` share one
 * answer and the spec can exercise each branch without a database.
 *
 * Routing is verified with a "dry-run" resolution — no ticket is created.
 */
export const installReadinessCheckKeys = [
  'superAdmin',
  'authMode',
  'organizationalUnit',
  'handlerGroup',
  'service',
  'routing',
  'slaProfile',
  'roles',
] as const;

/**
 * F6.1: which wizard step answers a red check. The provisioning screen offers
 * „Idi na korak“ from here — the mapping lives next to the checks, so a new check
 * cannot be added without deciding where its operator goes.
 *
 * `roles` has no step on purpose: the system roles are created by the product
 * itself, so a red `roles` is not something the wizard asks for.
 */
export const installReadinessStepKeys: Readonly<
  Record<InstallReadinessBaseCheckKey, InstallStepKey | null>
> = {
  superAdmin: 'superAdmin',
  authMode: 'loginProvider',
  organizationalUnit: 'seed',
  handlerGroup: 'team',
  service: 'seed',
  routing: 'seed',
  slaProfile: 'slaReview',
  roles: null,
};

/**
 * F1 adds `profileSteps`, which needs the step registry — the pure function here
 * stays unaware of packages, and `install-readiness.service.ts` appends it.
 */
export const installReadinessProfileStepsKey = 'profileSteps' as const;

export type InstallReadinessBaseCheckKey =
  (typeof installReadinessCheckKeys)[number];

export type InstallReadinessCheckKey =
  | InstallReadinessBaseCheckKey
  | typeof installReadinessProfileStepsKey;

export type InstallReadinessCheckStatus = 'ok' | 'missing' | 'skipped';

export type InstallReadinessCheck = {
  readonly key: InstallReadinessCheckKey;
  readonly status: InstallReadinessCheckStatus;
  /** i18n key of the human line the wizard shows (`install.readiness.<key>`). */
  readonly messageKey: string;
  /** `profileSteps` (F1) lists the steps behind a non-green status. */
  readonly stepKeys?: readonly string[];
  /**
   * F6.1: the wizard step where the operator fixes a red check. The provisioning
   * screen offers „Idi na korak“ only when there is one; `roles` failing is an
   * installation problem no step can answer, so it stays without a link.
   */
  readonly stepKey?: InstallStepKey | null;
};

export type InstallReadinessResult = {
  readonly isReady: boolean;
  readonly checks: readonly InstallReadinessCheck[];
};

export type InstallReadinessSource = {
  readonly readSuperAdminExists: () => Promise<boolean>;
  readonly readAuthMode: () => Promise<{ readonly saved: boolean; readonly valid: boolean }>;
  readonly readOrganizationalUnitCount: () => Promise<number>;
  readonly readActiveHandlerMemberCount: () => Promise<number>;
  readonly readActiveServiceWithFormCount: () => Promise<number>;
  /** Outcome of the dry-run routing resolution, expected to be `EXACT`. */
  readonly readRoutingOutcome: () => Promise<string | null>;
  /** F2: the seeded service is bound to an active SLA profile. */
  readonly readSeededServiceUnderActiveSla: () => Promise<boolean>;
  readonly readSystemRoleState: () => Promise<{
    readonly rolesPresent: number;
    readonly rolesExpected: number;
    readonly hasDefaultPermissions: boolean;
  }>;
};

export async function evaluateInstallReadiness(
  source: InstallReadinessSource,
): Promise<InstallReadinessResult> {
  const [
    superAdminExists,
    authMode,
    organizationalUnitCount,
    activeHandlerMemberCount,
    activeServiceWithFormCount,
    routingOutcome,
    seededServiceUnderActiveSla,
    roleState,
  ] = await Promise.all([
    source.readSuperAdminExists(),
    source.readAuthMode(),
    source.readOrganizationalUnitCount(),
    source.readActiveHandlerMemberCount(),
    source.readActiveServiceWithFormCount(),
    source.readRoutingOutcome(),
    source.readSeededServiceUnderActiveSla(),
    source.readSystemRoleState(),
  ]);

  const checks: InstallReadinessCheck[] = [
    check('superAdmin', superAdminExists),
    check('authMode', authMode.saved && authMode.valid),
    check('organizationalUnit', organizationalUnitCount > 0),
    check('handlerGroup', activeHandlerMemberCount > 0),
    check('service', activeServiceWithFormCount > 0),
    check('routing', routingOutcome === 'EXACT'),
    check('slaProfile', seededServiceUnderActiveSla),
    check(
      'roles',
      roleState.rolesPresent >= roleState.rolesExpected &&
        roleState.hasDefaultPermissions &&
        roleState.rolesExpected > 0,
    ),
  ];

  return {
    isReady: isInstallReadinessResultReady(checks),
    checks,
  };
}

export function isInstallReadinessResultReady(
  checks: readonly InstallReadinessCheck[],
): boolean {
  // `skipped` is a deliberate "configure later" (D4) and never blocks; only a
  // `missing` check does.
  return checks.every((entry) => entry.status !== 'missing');
}

export function readMissingReadinessKeys(
  checks: readonly InstallReadinessCheck[],
): readonly string[] {
  return checks
    .filter((entry) => entry.status === 'missing')
    .map((entry) => entry.key);
}

export function installReadinessMessageKey(key: string): string {
  return `install.readiness.${key}`;
}

function check(
  key: InstallReadinessBaseCheckKey,
  isSatisfied: boolean,
): InstallReadinessCheck {
  return {
    key,
    status: isSatisfied ? 'ok' : 'missing',
    messageKey: installReadinessMessageKey(key),
    stepKey: installReadinessStepKeys[key],
  };
}
