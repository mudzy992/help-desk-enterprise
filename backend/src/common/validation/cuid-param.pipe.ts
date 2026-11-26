import { BadRequestException, type PipeTransform } from '@nestjs/common';

/**
 * W2.17 (`BA-authentication-04`): the route param contract follows the schema, not
 * a guess about it. `UserSession.id` (and every other exposed Prisma id) is
 * `@default(cuid())` — 25 characters, `c` followed by lower-case base36 — so
 * `ParseUUIDPipe` refused the very ids the API itself lists: revoking a single
 * session answered `400` before the ownership check could run.
 *
 * The accepted range is deliberately bounded and slightly wider than a v1 cuid
 * (20–30 characters) so a future generator change does not break live endpoints,
 * while anything longer/shorter, upper-case, or UUID-shaped stays rejected before
 * it reaches a query.
 */
export const cuidParamPattern = /^c[0-9a-z]{19,29}$/;

/** `@default(cuid())` in the schema, kept next to the pattern it justifies. */
export const cuidLength = 25;

export function isCuidParamValue(value: unknown): value is string {
  return typeof value === 'string' && cuidParamPattern.test(value);
}

/**
 * Bounded validator for `:id`-style parameters whose source is a Prisma cuid.
 * Use it wherever `User.id`, `UserSession.id` (or another cuid) appears in a path;
 * the answer for a malformed value is a stable `400 INVALID_ID`, never a 500 and
 * never a silent pass-through into Prisma.
 */
export class CuidParamPipe implements PipeTransform<string, string> {
  constructor(private readonly parameter: string = 'id') {}

  transform(value: string): string {
    if (isCuidParamValue(value)) return value;
    throw new BadRequestException({
      code: 'INVALID_ID',
      message: `${this.parameter} is not a valid identifier`,
    });
  }
}
