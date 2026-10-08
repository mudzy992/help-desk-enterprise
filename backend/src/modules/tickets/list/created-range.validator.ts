import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Paket 5.3.1: `createdTo` may not lie before `createdFrom`. Both are ISO
 * instants (the client converts the user's local days to UTC bounds), both
 * inclusive. An open side (either missing) always passes; malformed values are
 * left to `@IsISO8601`.
 */
export function isCreatedRangeOrdered(
  createdFrom: unknown,
  createdTo: unknown,
): boolean {
  if (typeof createdFrom !== 'string' || typeof createdTo !== 'string') {
    return true;
  }
  const from = Date.parse(createdFrom);
  const to = Date.parse(createdTo);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return true;
  }
  return from <= to;
}

@ValidatorConstraint({ name: 'createdRangeOrdered', async: false })
export class CreatedRangeOrderedConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown, args: ValidationArguments): boolean {
    const target = args.object as { createdFrom?: unknown };
    return isCreatedRangeOrdered(target.createdFrom, value);
  }

  defaultMessage(): string {
    return 'createdTo must not be before createdFrom';
  }
}
