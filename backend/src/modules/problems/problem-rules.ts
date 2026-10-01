import { problemErrorCodes, problemLimits, ProblemError, type ProblemStatusValue } from './problems.constants';

/**
 * Paket 3.3 (§5): allowed status transitions. CLOSED is final; CANCELLED can
 * be reopened to INVESTIGATING (problem.close), like RESOLVED.
 */
const transitions: Record<ProblemStatusValue, readonly ProblemStatusValue[]> = {
  NEW: ['INVESTIGATING', 'CANCELLED'],
  INVESTIGATING: ['KNOWN_ERROR', 'RESOLVED', 'CANCELLED'],
  KNOWN_ERROR: ['INVESTIGATING', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: [],
  CANCELLED: ['INVESTIGATING'],
};

export function allowedProblemTransitions(from: ProblemStatusValue): readonly ProblemStatusValue[] {
  return transitions[from];
}

/** Transitions that need `problem.close` on top of `problem.manage`. */
export function transitionNeedsClosePermission(from: ProblemStatusValue, to: ProblemStatusValue): boolean {
  if (to === 'CLOSED' || to === 'CANCELLED') return true;
  return to === 'INVESTIGATING' && (from === 'RESOLVED' || from === 'CANCELLED');
}

/** Transitions that need a reason (cancel, reopen). */
export function transitionNeedsReason(from: ProblemStatusValue, to: ProblemStatusValue): boolean {
  return to === 'CANCELLED' || (to === 'INVESTIGATING' && (from === 'RESOLVED' || from === 'CANCELLED'));
}

export type ProblemTransitionState = {
  readonly status: ProblemStatusValue;
  readonly ownerUserId: string | null;
  readonly rootCause: string | null;
  readonly rootCauseCategory: string | null;
  readonly workaround: string | null;
  readonly resolution: string | null;
};

const filled = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;

/**
 * Validates a transition and returns nothing; throws ProblemError with the
 * missing requirement as detail (owner, rootCause, rootCauseCategory,
 * workaround, resolution, reason).
 */
export function assertProblemTransition(
  state: ProblemTransitionState,
  to: ProblemStatusValue,
  options: { readonly reason?: string | null; readonly requireWorkaroundForKnownError: boolean },
): void {
  if (state.status === to || !transitions[state.status].includes(to)) {
    throw new ProblemError(problemErrorCodes.statusTransition, `${state.status}->${to}`);
  }
  if (transitionNeedsReason(state.status, to)) {
    const reason = options.reason?.trim() ?? '';
    if (reason.length < problemLimits.reasonMin) throw new ProblemError(problemErrorCodes.reasonRequired);
  }
  if (to === 'INVESTIGATING' && !filled(state.ownerUserId)) {
    throw new ProblemError(problemErrorCodes.requirementMissing, 'owner');
  }
  if (to === 'KNOWN_ERROR') {
    if (!filled(state.rootCause)) throw new ProblemError(problemErrorCodes.requirementMissing, 'rootCause');
    if (!filled(state.rootCauseCategory)) throw new ProblemError(problemErrorCodes.requirementMissing, 'rootCauseCategory');
    if (options.requireWorkaroundForKnownError && !filled(state.workaround)) {
      throw new ProblemError(problemErrorCodes.requirementMissing, 'workaround');
    }
  }
  if (to === 'RESOLVED' && !filled(state.resolution)) {
    throw new ProblemError(problemErrorCodes.requirementMissing, 'resolution');
  }
}

/** Timestamps set by a transition (§4). */
export function transitionTimestamps(from: ProblemStatusValue, to: ProblemStatusValue, now: Date): Record<string, Date | null> {
  switch (to) {
    case 'KNOWN_ERROR':
      return { identifiedAt: now };
    case 'RESOLVED':
      return { resolvedAt: now };
    case 'CLOSED':
      return { closedAt: now };
    case 'CANCELLED':
      return { cancelledAt: now };
    case 'INVESTIGATING':
      return from === 'RESOLVED' || from === 'CANCELLED' ? { resolvedAt: null, cancelledAt: null } : {};
    default:
      return {};
  }
}

export function formatProblemNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(6, '0')}`;
}

/** "P-000042" / "000042" / "42" -> 42 when the search looks like a number. */
export function parseProblemNumberSearch(search: string, prefix: string): number | null {
  let value = search.trim();
  if (prefix.length > 0 && value.toUpperCase().startsWith(prefix.toUpperCase())) value = value.slice(prefix.length);
  if (!/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

export type ProblemWhy = { readonly question: string; readonly answer: string };

/** Normalises the "5 whys" input; empty rows are dropped. Throws on bad shape. */
export function normalizeWhys(input: unknown): ProblemWhy[] | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input) || input.length > problemLimits.whysMax) {
    throw new ProblemError(problemErrorCodes.validation, 'rcaWhys');
  }
  const rows: ProblemWhy[] = [];
  for (const entry of input) {
    if (typeof entry !== 'object' || entry === null) throw new ProblemError(problemErrorCodes.validation, 'rcaWhys');
    const { question, answer } = entry as Record<string, unknown>;
    if (typeof question !== 'string' || typeof answer !== 'string') throw new ProblemError(problemErrorCodes.validation, 'rcaWhys');
    const q = question.trim();
    const a = answer.trim();
    if (q.length > problemLimits.whyTextMax || a.length > problemLimits.whyTextMax) {
      throw new ProblemError(problemErrorCodes.validation, 'rcaWhys');
    }
    if (q.length === 0 && a.length === 0) continue;
    rows.push({ question: q, answer: a });
  }
  return rows.length === 0 ? null : rows;
}
