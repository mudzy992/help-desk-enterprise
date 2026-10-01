import type { ChangeConfiguration } from './change-access.service';
import type { ChangeTypeValue } from './changes.constants';

export type ChangeVote = { readonly approverUserId: string | null; readonly decision: 'PENDING' | 'APPROVED' | 'REJECTED' };

/** §8: quorum = min(setting, eligible voters), at least 1. Standard changes have none. */
export function computeChangeQuorum(type: ChangeTypeValue, configuration: Pick<ChangeConfiguration, 'normalQuorum' | 'emergencyQuorum'>, eligible: number): number {
  if (type === 'STANDARD') return 0;
  const wanted = type === 'EMERGENCY' ? configuration.emergencyQuorum : configuration.normalQuorum;
  return Math.max(1, Math.min(wanted, eligible));
}

/** §8: one rejection rejects; enough approvals approve; otherwise still pending. */
export function evaluateChangeVotes(votes: readonly ChangeVote[], quorum: number): 'APPROVED' | 'REJECTED' | 'PENDING' {
  if (votes.some((vote) => vote.decision === 'REJECTED')) return 'REJECTED';
  const approvals = new Set(votes.filter((vote) => vote.decision === 'APPROVED').map((vote) => vote.approverUserId)).size;
  return quorum > 0 && approvals >= quorum ? 'APPROVED' : 'PENDING';
}
