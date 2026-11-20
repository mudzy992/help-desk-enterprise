import type { ChangeConfiguration } from './change-access.service';
import { clampChangeInteger, changeConfigurationBounds } from './change-configuration-bounds';
import { changeDefaults } from '../settings/definitions/change-settings';
import type { ChangeTypeValue } from './changes.constants';

export type ChangeVote = { readonly approverUserId: string | null; readonly decision: 'PENDING' | 'APPROVED' | 'REJECTED' };

/**
 * §8: quorum = min(setting, eligible voters), at least 1. Standard changes have none.
 *
 * W7.77 (`BA-changes-19`): the setting is clamped here too, not only where it is read. This is the function
 * that turns configuration into a decision, so a broken value must not reach it: `NaN` used to make
 * `evaluateChangeVotes` return PENDING forever, and 0 or a negative number could approve a round by itself.
 */
export function computeChangeQuorum(type: ChangeTypeValue, configuration: Pick<ChangeConfiguration, 'normalQuorum' | 'emergencyQuorum'>, eligible: number): number {
  if (type === 'STANDARD') return 0;
  const emergency = type === 'EMERGENCY';
  const wanted = clampChangeInteger(
    emergency ? configuration.emergencyQuorum : configuration.normalQuorum,
    emergency ? changeConfigurationBounds.emergencyQuorum : changeConfigurationBounds.normalQuorum,
    emergency ? changeDefaults.emergencyQuorum : changeDefaults.normalQuorum,
  );
  const voters = Number.isFinite(eligible) && eligible > 0 ? Math.floor(eligible) : 0;
  return Math.max(1, Math.min(wanted, voters));
}

/** §8: one rejection rejects; enough approvals approve; otherwise still pending. */
export function evaluateChangeVotes(votes: readonly ChangeVote[], quorum: number): 'APPROVED' | 'REJECTED' | 'PENDING' {
  if (votes.some((vote) => vote.decision === 'REJECTED')) return 'REJECTED';
  const approvals = new Set(votes.filter((vote) => vote.decision === 'APPROVED').map((vote) => vote.approverUserId)).size;
  return quorum > 0 && approvals >= quorum ? 'APPROVED' : 'PENDING';
}
