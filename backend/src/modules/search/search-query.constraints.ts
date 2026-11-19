import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  countSearchQueryCharacters,
  isUsableSearchQuery,
} from './normalize-search-query';
import { searchConstants } from './search.constants';

/**
 * W7.56 (BA-search-02): the length rule of `q`, applied to the **normalized**
 * value (the DTO transforms `q` before validation).
 *
 * `@MinLength/@MaxLength` count UTF-16 units and run on the raw string, which is
 * exactly the bypass the audit described: two spaces, a space plus one letter,
 * a single emoji or two zero-width characters all "fit" while the effective
 * needle is empty or one character. This constraint counts characters
 * (code points) of the normalized query instead.
 */
@ValidatorConstraint({ name: 'searchQueryLength', async: false })
export class SearchQueryLengthConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      // The type itself is reported by `@IsString`.
      return false;
    }
    return isUsableSearchQuery(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const value = typeof args.value === 'string' ? args.value : '';
    return (
      `q must contain between ${searchConstants.minimumQueryLength} and ` +
      `${searchConstants.maximumQueryLength} characters after normalization ` +
      `(got ${countSearchQueryCharacters(value)})`
    );
  }
}
