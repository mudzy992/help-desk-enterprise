import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TicketPriority, TicketStatus } from '../../../generated/prisma/enums';
import {
  ticketListPaging,
  ticketListSortDirections,
  ticketListSortFields,
} from '../list/list-tickets.constants';
import {
  toQueryBoolean,
  toQueryList,
} from '../list/list-query-transforms';
import type {
  TicketListSortDirection,
  TicketListSortField,
} from '../list/list-tickets.types';

export class ListTicketsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(12)
  @IsEnum(TicketStatus, { each: true })
  status?: TicketStatus[];

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

  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  atRisk?: boolean;

  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  includeArchived?: boolean;

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

  @IsOptional()
  @IsIn(ticketListSortFields)
  sort?: TicketListSortField;

  @IsOptional()
  @IsIn(ticketListSortDirections)
  dir?: TicketListSortDirection;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ticketListPaging.maxPageSize)
  pageSize?: number;
}
