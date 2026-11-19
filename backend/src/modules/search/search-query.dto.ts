import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
} from 'class-validator';
import { toQueryList } from '../tickets/list/list-query-transforms';
import { normalizeSearchQuery } from './normalize-search-query';
import { searchConstants, searchTypes } from './search.constants';
import { SearchQueryLengthConstraint } from './search-query.constraints';
import type { SearchType } from './search.types';

/**
 * `GET /search?q=&types=ticket,article,user&limit=15` (plan §1.2).
 *
 * `q` is **normalized before it is validated** (W7.56, `normalize-search-query.ts`):
 * NFKC, zero-width/format characters removed, whitespace collapsed and trimmed.
 * The length rule therefore applies to the effective needle and needs at least
 * two characters of content — two spaces, a space plus one letter, one emoji or
 * two zero-width characters are refused instead of becoming an empty `contains`
 * that would return the newest visible rows of every group.
 *
 * `limit` is clamped by validation to `[1, 25]`, and `types` defaults to all
 * three groups.
 */
export class SearchQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeSearchQuery(value) : value,
  )
  @IsString()
  @Validate(SearchQueryLengthConstraint)
  q!: string;

  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(searchTypes.length)
  @IsIn(searchTypes, { each: true })
  types?: SearchType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(searchConstants.maxLimit)
  limit?: number;
}

/** Applies the defaults and the ceiling once, for the service to rely on. */
export function toSearchQuery(dto: SearchQueryDto): {
  readonly q: string;
  readonly types: readonly SearchType[];
  readonly limit: number;
} {
  return {
    // Normalization is idempotent, so the mapping repeats it: a caller that
    // builds the DTO by hand gets the same needle the HTTP path produces.
    q: normalizeSearchQuery(dto.q),
    types: dto.types === undefined ? searchTypes : dto.types,
    limit: Math.min(
      Math.max(dto.limit ?? searchConstants.defaultLimit, 1),
      searchConstants.maxLimit,
    ),
  };
}
