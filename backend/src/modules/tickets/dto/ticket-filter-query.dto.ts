import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { CreatedRangeOrderedConstraint } from '../list/created-range.validator';
import { TicketPriority } from '../../../generated/prisma/enums';
import { toQueryBoolean } from '../list/list-query-transforms';

/**
 * The narrowing filters shared by every reader of the ticket list: the list
 * itself and the counts that sit next to it. What only makes sense for a
 * page of results (status, SLA state, sort, paging) lives on the subclasses.
 */
export class TicketFilterQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedUserId?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MinLength(1)
  requesterId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string;

  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  unassigned?: boolean;

  /** Package 1.2 (M7): leave out tickets merged into another ticket. */
  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  hideMerged?: boolean;

  /** Package 1.7 (U3). */
  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  unroutedOverdue?: boolean;

  /** Paket 2.4 (C5): tickets I follow. */
  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  following?: boolean;

  /** Paket 2.4 (B6): tickets where I was @mentioned in the last 30 days. */
  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  mentionedMe?: boolean;

  @IsOptional()
  @IsIn(['any', 'toMyGroups'])
  forwarded?: 'any' | 'toMyGroups';

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  @Validate(CreatedRangeOrderedConstraint)
  createdTo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q?: string;
}
