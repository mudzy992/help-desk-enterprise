import {
  allowedProblemTransitions,
  assertProblemTransition,
  formatProblemNumber,
  normalizeWhys,
  parseProblemNumberSearch,
  transitionNeedsClosePermission,
  transitionTimestamps,
  type ProblemTransitionState,
} from './problem-rules';
import { parseProblemListQuery } from './problems.controller';
import { ProblemError, problemErrorCodes } from './problems.constants';
import { parseRootCauseCategories } from '../settings/definitions/problem-settings';

const base: ProblemTransitionState = {
  status: 'NEW',
  ownerUserId: null,
  rootCause: null,
  rootCauseCategory: null,
  workaround: null,
  resolution: null,
};
const options = { requireWorkaroundForKnownError: false };

function codeOf(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ProblemError ? `${error.code}:${error.detail ?? ''}` : 'other';
  }
}

describe('problem lifecycle (3.3 §5)', () => {
  it('lists the allowed transitions; CLOSED is final', () => {
    expect(allowedProblemTransitions('NEW')).toEqual(['INVESTIGATING', 'CANCELLED']);
    expect(allowedProblemTransitions('RESOLVED')).toEqual(['CLOSED', 'INVESTIGATING']);
    expect(allowedProblemTransitions('CLOSED')).toEqual([]);
  });

  it('rejects unknown transitions and same-status moves', () => {
    expect(codeOf(() => assertProblemTransition(base, 'RESOLVED', options))).toBe(`${problemErrorCodes.statusTransition}:NEW->RESOLVED`);
    expect(codeOf(() => assertProblemTransition(base, 'NEW', options))).toBe(`${problemErrorCodes.statusTransition}:NEW->NEW`);
  });

  it('needs an owner to start the investigation', () => {
    expect(codeOf(() => assertProblemTransition(base, 'INVESTIGATING', options))).toBe(`${problemErrorCodes.requirementMissing}:owner`);
    expect(codeOf(() => assertProblemTransition({ ...base, ownerUserId: 'u1' }, 'INVESTIGATING', options))).toBeNull();
  });

  it('needs root cause and category for a known error; workaround only when configured', () => {
    const investigating = { ...base, status: 'INVESTIGATING' as const, ownerUserId: 'u1' };
    expect(codeOf(() => assertProblemTransition(investigating, 'KNOWN_ERROR', options))).toBe(`${problemErrorCodes.requirementMissing}:rootCause`);
    const withCause = { ...investigating, rootCause: 'Driver', rootCauseCategory: 'software' };
    expect(codeOf(() => assertProblemTransition(withCause, 'KNOWN_ERROR', options))).toBeNull();
    expect(codeOf(() => assertProblemTransition(withCause, 'KNOWN_ERROR', { requireWorkaroundForKnownError: true }))).toBe(
      `${problemErrorCodes.requirementMissing}:workaround`,
    );
  });

  it('needs a resolution to resolve and a reason to cancel or reopen', () => {
    const investigating = { ...base, status: 'INVESTIGATING' as const, ownerUserId: 'u1' };
    expect(codeOf(() => assertProblemTransition(investigating, 'RESOLVED', options))).toBe(`${problemErrorCodes.requirementMissing}:resolution`);
    expect(codeOf(() => assertProblemTransition(investigating, 'CANCELLED', { ...options, reason: 'no' }))).toBe(`${problemErrorCodes.reasonRequired}:`);
    expect(codeOf(() => assertProblemTransition(investigating, 'CANCELLED', { ...options, reason: 'Duplicate of P-1' }))).toBeNull();
    const resolved = { ...investigating, status: 'RESOLVED' as const, resolution: 'Patched' };
    expect(codeOf(() => assertProblemTransition(resolved, 'INVESTIGATING', options))).toBe(`${problemErrorCodes.reasonRequired}:`);
    expect(codeOf(() => assertProblemTransition(resolved, 'INVESTIGATING', { ...options, reason: 'Incidents are back' }))).toBeNull();
  });

  it('marks close, cancel and reopen as problem.close transitions', () => {
    expect(transitionNeedsClosePermission('RESOLVED', 'CLOSED')).toBe(true);
    expect(transitionNeedsClosePermission('NEW', 'CANCELLED')).toBe(true);
    expect(transitionNeedsClosePermission('RESOLVED', 'INVESTIGATING')).toBe(true);
    expect(transitionNeedsClosePermission('KNOWN_ERROR', 'INVESTIGATING')).toBe(false);
    expect(transitionNeedsClosePermission('INVESTIGATING', 'RESOLVED')).toBe(true);
  });

  it('sets and clears timestamps', () => {
    const now = new Date('2026-10-01T08:00:00Z');
    expect(transitionTimestamps('INVESTIGATING', 'KNOWN_ERROR', now)).toEqual({ identifiedAt: now });
    expect(transitionTimestamps('RESOLVED', 'INVESTIGATING', now)).toEqual({ resolvedAt: null, cancelledAt: null });
    expect(transitionTimestamps('NEW', 'INVESTIGATING', now)).toEqual({});
  });
});

describe('problem helpers', () => {
  it('formats and parses numbers', () => {
    expect(formatProblemNumber('P-', 42)).toBe('P-000042');
    expect(parseProblemNumberSearch('p-000042', 'P-')).toBe(42);
    expect(parseProblemNumberSearch('42', 'P-')).toBe(42);
    expect(parseProblemNumberSearch('printer', 'P-')).toBeNull();
    expect(parseProblemNumberSearch('0', 'P-')).toBeNull();
  });

  it('normalises the five whys', () => {
    expect(normalizeWhys(null)).toBeNull();
    expect(normalizeWhys([{ question: ' Why? ', answer: ' Because ' }, { question: '', answer: '' }])).toEqual([
      { question: 'Why?', answer: 'Because' },
    ]);
    expect(codeOf(() => normalizeWhys(new Array(6).fill({ question: 'a', answer: 'b' })))).toBe(`${problemErrorCodes.validation}:rcaWhys`);
  });

  it('parses root cause categories', () => {
    expect(parseRootCauseCategories('software, network,software')).toEqual(['software', 'network']);
    expect(parseRootCauseCategories('Software')).toBeNull();
    expect(parseRootCauseCategories('')).toBeNull();
  });

  it('parses list queries defensively', () => {
    expect(parseProblemListQuery({ status: 'NEW,BOGUS', priority: 'HIGH', limit: '10' })).toMatchObject({
      status: ['NEW'],
      priority: ['HIGH'],
      limit: 10,
    });
    expect(parseProblemListQuery({ knownErrors: 'true', status: 'NEW' }).status).toEqual(['KNOWN_ERROR']);
  });
});
