import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { notificationTypes, type NotificationType } from '../notifications.constants';

/**
 * Paket 2.2 (N1): the single source of truth for what a user can tune. The UI
 * shows categories, not the 19 technical types; a preference row stores the
 * category key. Every `notificationTypes` value is either in exactly one
 * category or deliberately left out (see the spec, which fails on a new type
 * without a decision).
 */
export const notificationEmailModes = ['IMMEDIATE', 'DIGEST', 'OFF'] as const;
export type NotificationEmailMode = (typeof notificationEmailModes)[number];

export type NotificationRoleRank = 0 | 1 | 2 | 3;

export type NotificationPreferenceCategory = {
  readonly key: string;
  readonly types: readonly NotificationType[];
  /** Lowest role that can ever receive it (USER=0 … SUPER_ADMIN=3). */
  readonly minRoleRank: NotificationRoleRank;
  readonly channels: { readonly inApp: boolean; readonly email: boolean };
  /** Security / safeguard: always delivered, shown only as information. */
  readonly alwaysOn: boolean;
};

const category = (
  key: string,
  types: readonly NotificationType[],
  minRoleRank: NotificationRoleRank,
  channels: { inApp: boolean; email: boolean },
  alwaysOn = false,
): NotificationPreferenceCategory => ({ key, types, minRoleRank, channels, alwaysOn });

const both = { inApp: true, email: true };
const inAppOnly = { inApp: true, email: false };

export const notificationPreferenceCategories: readonly NotificationPreferenceCategory[] = [
  category('ticket.created', [notificationTypes.ticketCreated], 1, both),
  category('ticket.assigned', [notificationTypes.ticketAssigned], 1, both),
  category('ticket.forwarded', [notificationTypes.ticketForwarded], 1, both),
  category('ticket.message', [notificationTypes.ticketMessage], 0, both),
  category(
    'ticket.outcome',
    [notificationTypes.ticketResolved, notificationTypes.ticketClosed],
    0,
    both,
  ),
  category('ticket.approval', [notificationTypes.ticketApproval], 0, both),
  // E-mail exists only for escalations (admin rule, paket 1.5).
  category('ticket.sla', [notificationTypes.ticketSla], 1, both),
  category('remote.requested', [notificationTypes.remoteRequested], 0, both),
  category('ticket.timeAutoStopped', [notificationTypes.ticketTimeAutoStopped], 1, inAppOnly),
  category(
    'ticket.unrouted',
    [notificationTypes.ticketUnroutedOverdue, notificationTypes.ticketUnroutedDigest],
    2,
    inAppOnly,
  ),
  category('knowledge.reviewDue', [notificationTypes.knowledgeReviewDue], 1, inAppOnly),
  category('directory.syncAborted', [notificationTypes.directorySyncAborted], 3, inAppOnly, true),
  category(
    'account.security',
    [
      notificationTypes.accountMfaChanged,
      notificationTypes.accountRecoveryCodeUsed,
      notificationTypes.accountPasswordChanged,
      notificationTypes.accountNewDevice,
    ],
    0,
    inAppOnly,
    true,
  ),
];

const categoryByType = new Map<string, NotificationPreferenceCategory>(
  notificationPreferenceCategories.flatMap((entry) =>
    entry.types.map((type) => [type, entry] as const),
  ),
);
const categoryByKey = new Map(notificationPreferenceCategories.map((entry) => [entry.key, entry]));

export function findPreferenceCategoryForType(type: string): NotificationPreferenceCategory | null {
  return categoryByType.get(type) ?? null;
}

export function findPreferenceCategory(key: string): NotificationPreferenceCategory | null {
  return categoryByKey.get(key) ?? null;
}

/** Keys an administrator may put into the lock / default / bypass lists. */
export const configurablePreferenceCategoryKeys: readonly string[] =
  notificationPreferenceCategories.filter((entry) => !entry.alwaysOn).map((entry) => entry.key);

const roleRanks: Readonly<Record<string, NotificationRoleRank>> = {
  [authorizationRoleKeys.user]: 0,
  [authorizationRoleKeys.agent]: 1,
  [authorizationRoleKeys.admin]: 2,
  [authorizationRoleKeys.superAdmin]: 3,
};

export function highestRoleRank(roleKeys: readonly string[], isSuperAdmin = false): NotificationRoleRank {
  let rank: NotificationRoleRank = isSuperAdmin ? 3 : 0;
  for (const key of roleKeys) {
    const candidate = roleRanks[key];
    if (candidate !== undefined && candidate > rank) rank = candidate;
  }
  return rank;
}

export function categoriesForRoleRank(rank: NotificationRoleRank): readonly NotificationPreferenceCategory[] {
  return notificationPreferenceCategories.filter((entry) => entry.minRoleRank <= rank);
}
