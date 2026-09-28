import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { anonymizationBlockReasons, type AnonymizationBlockReason } from '../privacy.constants';

export type AnonymizationFacts = {
  readonly isActive: boolean;
  readonly anonymizedAt: Date | null;
  readonly legalHoldAt: Date | null;
  readonly directoryObjectGuid: string | null;
  readonly directoryDeactivatedAt: Date | null;
  readonly roleKeys: readonly string[];
  /** Other active ADMIN/SUPER_ADMIN accounts. */
  readonly otherActiveAdmins: number;
  readonly openAssignedTickets: number;
  readonly exportInProgress: boolean;
  readonly erasureInProgress: boolean;
  readonly isSelf: boolean;
};

/**
 * Paket 2.6 (§6.1): reasons that refuse an anonymization. An account that is
 * linked to AD but was not deactivated by the directory sync is still active
 * in AD (an admin only switched it off here) and would be recreated.
 */
export function evaluateAnonymizationBlockers(facts: AnonymizationFacts): AnonymizationBlockReason[] {
  const reasons: AnonymizationBlockReason[] = [];
  if (facts.anonymizedAt !== null) return [anonymizationBlockReasons.alreadyAnonymized];
  if (facts.isSelf) reasons.push(anonymizationBlockReasons.self);
  if (facts.isActive) reasons.push(anonymizationBlockReasons.active);
  if (!facts.isActive && facts.directoryObjectGuid !== null && facts.directoryDeactivatedAt === null) {
    reasons.push(anonymizationBlockReasons.activeInDirectory);
  }
  if (facts.roleKeys.includes(authorizationRoleKeys.superAdmin)) reasons.push(anonymizationBlockReasons.superAdmin);
  if (facts.roleKeys.includes(authorizationRoleKeys.admin) && facts.otherActiveAdmins === 0) {
    reasons.push(anonymizationBlockReasons.lastAdmin);
  }
  if (facts.legalHoldAt !== null) reasons.push(anonymizationBlockReasons.legalHold);
  if (facts.openAssignedTickets > 0) reasons.push(anonymizationBlockReasons.openAssignedTickets);
  if (facts.exportInProgress) reasons.push(anonymizationBlockReasons.exportInProgress);
  if (facts.erasureInProgress) reasons.push(anonymizationBlockReasons.erasureInProgress);
  return reasons;
}
