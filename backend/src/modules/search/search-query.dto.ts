import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { toQueryList } from '../tickets/list/list-query-transforms';
import { searchConstants, searchTypes } from './search.constants';
import type { SearchType } from './search.types';

/**
 * `GET /search?q=&types=ticket,article,user&limit=15` (plan §1.2).
 *
 * `q` needs at least two characters, `limit` is clamped by validation to
 * `[1, 25]`, and `types` defaults to all three groups.
 */
export class SearchQueryDto {
  @IsString()
  @MinLength(searchConstants.minimumQueryLength)
  @MaxLength(searchConstants.maximumQueryLength)
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
    q: dto.q.trim(),
    types: dto.types === undefined ? searchTypes : dto.types,
    limit: Math.min(
      Math.max(dto.limit ?? searchConstants.defaultLimit, 1),
      searchConstants.maxLimit,
    ),
  };
}
