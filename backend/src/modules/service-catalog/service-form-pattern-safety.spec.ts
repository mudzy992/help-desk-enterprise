import {
  classifyServiceFormPattern,
  utf8ByteLengthWithinLimit,
} from './service-form-pattern-safety';

describe('classifyServiceFormPattern', () => {
  it.each(['^[a-z0-9-]+$', '^\\d{4}-\\d{2}-\\d{2}$', '^.{1,32}$', '[A-Z]{2}', '^\\x41\\u0042$'])(
    'accepts safe bounded pattern %s',
    (pattern) => {
      expect(classifyServiceFormPattern(pattern)).toEqual({ safe: true });
    },
  );

  it.each([
    ['^(a+)+$', 'UNSUPPORTED_GROUP_OR_ALTERNATION'],
    ['^([a-z]+|[A-Z]+)$', 'UNSUPPORTED_GROUP_OR_ALTERNATION'],
    ['^a+a+$', 'MULTIPLE_VARIABLE_REPETITIONS'],
    ['a*foo', 'VARIABLE_REPETITION_REQUIRES_START_ANCHOR'],
    ['^a*?$', 'UNSUPPORTED_LAZY_REPETITION'],
    ['^\\1$', 'BACKREFERENCE_OR_ASSERTION'],
    ['^\\bword$', 'BACKREFERENCE_OR_ASSERTION'],
    ['^a{257}$', 'REPETITION_BOUND_EXCEEDED'],
    ['^a{999999999999999999999999}$', 'REPETITION_BOUND_EXCEEDED'],
    ['[z-a]', 'INVALID_PATTERN_SYNTAX'],
    ['[abc', 'INVALID_PATTERN_SYNTAX'],
  ] as const)('rejects unsafe pattern %s with %s', (pattern, reason) => {
    expect(classifyServiceFormPattern(pattern)).toEqual({ safe: false, reason });
  });

  it('limits both the pattern length and total fixed repetition budget', () => {
    expect(classifyServiceFormPattern('a'.repeat(257))).toEqual({
      safe: false,
      reason: 'PATTERN_LENGTH',
    });
    expect(classifyServiceFormPattern('a{256}b{256}c{256}d{256}e{1}')).toEqual({
      safe: false,
      reason: 'REPETITION_BUDGET_EXCEEDED',
    });
  });
});

describe('utf8ByteLengthWithinLimit', () => {
  it('measures ASCII, multi-byte characters, and surrogate pairs', () => {
    expect(utf8ByteLengthWithinLimit('desk', 4)).toBe(4);
    expect(utf8ByteLengthWithinLimit('é', 2)).toBe(2);
    expect(utf8ByteLengthWithinLimit('🛠️', 7)).toBe(7);
    expect(utf8ByteLengthWithinLimit('é', 1)).toBeNull();
  });
});
