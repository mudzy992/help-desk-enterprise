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
} from 'class-validator';
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

  @IsOptional()
  @IsIn(['any', 'toMyGroups'])
  forwarded?: 'any' | 'toMyGroups';

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q?: string;
}
