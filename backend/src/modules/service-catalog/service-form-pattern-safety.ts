import {
  serviceFormRegexSafetyConstants,
  serviceFormSchemaConstants,
} from './form-schema.constants';

export type ServiceFormPatternSafetyReason =
  | 'PATTERN_LENGTH'
  | 'UNSUPPORTED_GROUP_OR_ALTERNATION'
  | 'BACKREFERENCE_OR_ASSERTION'
  | 'MULTIPLE_VARIABLE_REPETITIONS'
  | 'VARIABLE_REPETITION_REQUIRES_START_ANCHOR'
  | 'REPETITION_BOUND_EXCEEDED'
  | 'REPETITION_BUDGET_EXCEEDED'
  | 'UNSUPPORTED_LAZY_REPETITION'
  | 'UNSUPPORTED_SYNTAX'
  | 'INVALID_PATTERN_SYNTAX';

export type ServiceFormPatternClassification =
  | { readonly safe: true }
  | { readonly safe: false; readonly reason: ServiceFormPatternSafetyReason };

const safe = { safe: true } as const;

/**
 * Classifies the deliberately small regex language used by service forms.
 * The scanner is linear in the bounded (256-character) pattern and never
 * executes the pattern. Accepted expressions have no groups/alternation and
 * at most one variable repetition; a variable repetition must start at ^ so
 * the JavaScript engine cannot retry it at every input offset.
 */
export function classifyServiceFormPattern(pattern: string): ServiceFormPatternClassification {
  if (pattern.length === 0 || pattern.length > serviceFormSchemaConstants.maximumPatternLength) {
    return unsafe('PATTERN_LENGTH');
  }

  let cursor = 0;
  let variableRepetitions = 0;
  let fixedRepetitionBudget = 0;

  while (cursor < pattern.length) {
    const token = pattern[cursor];
    if (token === '^') {
      if (cursor !== 0) return unsafe('UNSUPPORTED_SYNTAX');
      cursor += 1;
      continue;
    }
    if (token === '$') {
      if (cursor !== pattern.length - 1) return unsafe('UNSUPPORTED_SYNTAX');
      cursor += 1;
      continue;
    }
    if (token === '(' || token === ')' || token === '|') {
      return unsafe('UNSUPPORTED_GROUP_OR_ALTERNATION');
    }

    let atomEnd: number;
    if (token === '[') {
      const characterClass = readCharacterClass(pattern, cursor);
      if ('reason' in characterClass) return unsafe(characterClass.reason);
      atomEnd = characterClass.nextIndex;
    } else if (token === '\\') {
      const escaped = readEscape(pattern, cursor);
      if ('reason' in escaped) return unsafe(escaped.reason);
      atomEnd = escaped.nextIndex;
    } else if (token === '.') {
      atomEnd = cursor + 1;
    } else {
      if (token === '*' || token === '+' || token === '?' || token === '{') {
        return unsafe('UNSUPPORTED_SYNTAX');
      }
      if (token === '}' || token === ']') return unsafe('INVALID_PATTERN_SYNTAX');
      atomEnd = cursor + 1;
    }

    cursor = atomEnd;
    const quantifier = readQuantifier(pattern, cursor);
    if (quantifier === null) continue;
    if ('reason' in quantifier) return unsafe(quantifier.reason);
    cursor = quantifier.nextIndex;
    if (quantifier.variable) {
      variableRepetitions += 1;
      if (variableRepetitions > 1) {
        return unsafe('MULTIPLE_VARIABLE_REPETITIONS');
      }
    } else {
      fixedRepetitionBudget += quantifier.fixedCount;
      if (fixedRepetitionBudget > serviceFormRegexSafetyConstants.maximumFixedRepetitionBudget) {
        return unsafe('REPETITION_BUDGET_EXCEEDED');
      }
    }
    if (pattern[cursor] === '?') return unsafe('UNSUPPORTED_LAZY_REPETITION');
  }

  if (variableRepetitions > 0 && !pattern.startsWith('^')) {
    return unsafe('VARIABLE_REPETITION_REQUIRES_START_ANCHOR');
  }
  try {
    // Compilation is safe here: pattern length and grammar are bounded above.
    new RegExp(pattern);
  } catch {
    return unsafe('INVALID_PATTERN_SYNTAX');
  }
  return safe;
}

/** Returns the UTF-8 byte length, or null once the byte limit is exceeded. */
export function utf8ByteLengthWithinLimit(value: string, maximumBytes: number): number | null {
  if (value.length > maximumBytes) return null;

  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (isHighSurrogate(codeUnit) && isLowSurrogate(value.charCodeAt(index + 1))) {
      byteLength += 4;
      index += 1;
    } else {
      byteLength += 3;
    }
    if (byteLength > maximumBytes) return null;
  }
  return byteLength;
}

type TokenReadResult =
  { readonly nextIndex: number } | { readonly reason: ServiceFormPatternSafetyReason };

function readCharacterClass(pattern: string, startIndex: number): TokenReadResult {
  let cursor = startIndex + 1;
  if (pattern[cursor] === '^') cursor += 1;
  let hasMember = false;

  while (cursor < pattern.length) {
    const token = pattern[cursor];
    if (token === ']') {
      return hasMember ? { nextIndex: cursor + 1 } : { reason: 'INVALID_PATTERN_SYNTAX' };
    }
    if (token === '[') return { reason: 'UNSUPPORTED_SYNTAX' };
    if (token === '\\') {
      const escaped = readEscape(pattern, cursor);
      if ('reason' in escaped) return escaped;
      cursor = escaped.nextIndex;
      hasMember = true;
      continue;
    }
    cursor += 1;
    hasMember = true;
  }
  return { reason: 'INVALID_PATTERN_SYNTAX' };
}

function readEscape(pattern: string, startIndex: number): TokenReadResult {
  const escaped = pattern[startIndex + 1];
  if (escaped === undefined) return { reason: 'INVALID_PATTERN_SYNTAX' };
  if (isAsciiDigit(escaped) || escaped === 'k') {
    return { reason: 'BACKREFERENCE_OR_ASSERTION' };
  }
  if (escaped === 'b' || escaped === 'B') {
    return { reason: 'BACKREFERENCE_OR_ASSERTION' };
  }
  if ('dDsSwWnrtfv'.includes(escaped)) {
    return { nextIndex: startIndex + 2 };
  }
  if (escaped === '0') {
    if (isAsciiDigit(pattern[startIndex + 2])) {
      return { reason: 'BACKREFERENCE_OR_ASSERTION' };
    }
    return { nextIndex: startIndex + 2 };
  }
  if (escaped === 'x') {
    return hasHexDigits(pattern, startIndex + 2, 2)
      ? { nextIndex: startIndex + 4 }
      : { reason: 'INVALID_PATTERN_SYNTAX' };
  }
  if (escaped === 'u') {
    return hasHexDigits(pattern, startIndex + 2, 4)
      ? { nextIndex: startIndex + 6 }
      : { reason: 'INVALID_PATTERN_SYNTAX' };
  }
  if (isAsciiLetter(escaped)) return { reason: 'UNSUPPORTED_SYNTAX' };
  return { nextIndex: startIndex + 2 };
}

type QuantifierReadResult =
  | null
  | { readonly nextIndex: number; readonly reason: ServiceFormPatternSafetyReason }
  | {
      readonly nextIndex: number;
      readonly variable: boolean;
      readonly fixedCount: number;
    };

function readQuantifier(pattern: string, startIndex: number): QuantifierReadResult {
  const token = pattern[startIndex];
  if (token === '*' || token === '+' || token === '?') {
    return {
      nextIndex: startIndex + 1,
      variable: true,
      fixedCount: 0,
    };
  }
  if (token !== '{') return null;

  const minimum = readBound(pattern, startIndex + 1);
  if (minimum === null) return { reason: 'UNSUPPORTED_SYNTAX', nextIndex: startIndex };
  let cursor = minimum.nextIndex;
  let maximum: number | null = minimum.value;
  if (pattern[cursor] === ',') {
    cursor += 1;
    const parsedMaximum = readBound(pattern, cursor);
    if (parsedMaximum === null) {
      maximum = null;
    } else {
      maximum = parsedMaximum.value;
      cursor = parsedMaximum.nextIndex;
    }
  }
  if (pattern[cursor] !== '}') {
    return { reason: 'UNSUPPORTED_SYNTAX', nextIndex: startIndex };
  }
  if (maximum !== null && maximum < minimum.value) {
    return { reason: 'INVALID_PATTERN_SYNTAX', nextIndex: cursor + 1 };
  }
  if (
    minimum.value > serviceFormRegexSafetyConstants.maximumRepeatCount ||
    (maximum !== null && maximum > serviceFormRegexSafetyConstants.maximumRepeatCount)
  ) {
    return { reason: 'REPETITION_BOUND_EXCEEDED', nextIndex: cursor + 1 };
  }
  const variable = maximum === null || maximum !== minimum.value;
  return {
    nextIndex: cursor + 1,
    variable,
    fixedCount: variable ? 0 : minimum.value,
  };
}

function readBound(
  pattern: string,
  startIndex: number,
): { readonly value: number; readonly nextIndex: number } | null {
  let cursor = startIndex;
  let value = 0;
  let digitCount = 0;
  while (cursor < pattern.length && isAsciiDigit(pattern[cursor])) {
    value = Math.min(
      serviceFormRegexSafetyConstants.maximumRepeatCount + 1,
      value * 10 + pattern.charCodeAt(cursor) - 48,
    );
    digitCount += 1;
    cursor += 1;
  }
  return digitCount === 0 ? null : { value, nextIndex: cursor };
}

function hasHexDigits(pattern: string, startIndex: number, count: number): boolean {
  if (startIndex + count > pattern.length) return false;
  for (let cursor = startIndex; cursor < startIndex + count; cursor += 1) {
    const code = pattern.charCodeAt(cursor);
    const isDigit = code >= 48 && code <= 57;
    const isLowerHex = code >= 97 && code <= 102;
    const isUpperHex = code >= 65 && code <= 70;
    if (!isDigit && !isLowerHex && !isUpperHex) return false;
  }
  return true;
}

function isAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= '0' && value <= '9';
}

function isAsciiLetter(value: string): boolean {
  return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z');
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function unsafe(reason: ServiceFormPatternSafetyReason): ServiceFormPatternClassification {
  return { safe: false, reason };
}
