type Row = Readonly<Record<string, unknown>>;

const operatorNames = [
  'equals',
  'in',
  'notIn',
  'not',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'mode',
] as const;

function isPlainOperatorObject(value: unknown): value is Row {
  return (
    typeof value === 'object' && value !== null && !(value instanceof Date)
  );
}

function isSame(actual: unknown, expected: unknown): boolean {
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  return actual === expected;
}

function compare(actual: unknown, expected: unknown): number | null {
  if (actual === null || actual === undefined) {
    return null;
  }
  const left = actual instanceof Date ? actual.getTime() : actual;
  const right = expected instanceof Date ? expected.getTime() : expected;
  if (
    (typeof left === 'number' || typeof left === 'string') &&
    typeof left === typeof right
  ) {
    const other = right as typeof left;
    return left < other ? -1 : left > other ? 1 : 0;
  }
  return null;
}

/** Matches one scalar field against a Prisma filter value or operator object. */
export function matchesInMemoryField(
  value: unknown,
  condition: unknown,
): boolean {
  const actual = value === undefined ? null : value;
  if (!isPlainOperatorObject(condition)) {
    return isSame(actual, condition);
  }
  const unsupported = Object.keys(condition).filter(
    (key) => !(operatorNames as readonly string[]).includes(key),
  );
  if (unsupported.length > 0) {
    throw new Error(`Unsupported in-memory filter operator: ${unsupported[0]}`);
  }
  return Object.entries(condition).every(([operator, operand]) =>
    matchesOperator(actual, operator, operand, condition),
  );
}

function matchesOperator(
  actual: unknown,
  operator: string,
  operand: unknown,
  all: Row,
): boolean {
  switch (operator) {
    case 'equals':
      return isSame(actual, operand);
    case 'in':
      return (
        actual !== null &&
        (operand as readonly unknown[]).some((item) => isSame(actual, item))
      );
    case 'notIn':
      return (
        actual !== null &&
        !(operand as readonly unknown[]).some((item) => isSame(actual, item))
      );
    case 'not':
      // SQL semantics: `<> x` and `IS NOT NULL` both exclude NULL rows.
      return operand === null
        ? actual !== null
        : actual !== null && !matchesInMemoryField(actual, operand);
    case 'gt':
      return (compare(actual, operand) ?? -1) > 0;
    case 'gte':
      return (compare(actual, operand) ?? -1) >= 0;
    case 'lt':
      return (compare(actual, operand) ?? 1) < 0;
    case 'lte':
      return (compare(actual, operand) ?? 1) <= 0;
    case 'contains':
    case 'startsWith':
      return matchesText(
        actual,
        operator,
        String(operand),
        all.mode === 'insensitive',
      );
    default:
      return true; // `mode` only modifies contains/startsWith
  }
}

function matchesText(
  actual: unknown,
  operator: string,
  needle: string,
  insensitive: boolean,
): boolean {
  if (typeof actual !== 'string') {
    return false;
  }
  const haystack = insensitive ? actual.toLowerCase() : actual;
  const wanted = insensitive ? needle.toLowerCase() : needle;
  return operator === 'contains'
    ? haystack.includes(wanted)
    : haystack.startsWith(wanted);
}
