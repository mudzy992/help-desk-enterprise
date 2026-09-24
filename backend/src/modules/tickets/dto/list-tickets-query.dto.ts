import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { TicketStatus } from '../../../generated/prisma/enums';
import {
  toQueryBoolean,
  toQueryList,
} from '../list/list-query-transforms';
import {
  ticketListPaging,
  ticketListSortDirections,
  ticketListSortFields,
} from '../list/list-tickets.constants';
import type {
  TicketListSortDirection,
  TicketListSortField,
} from '../list/list-tickets.types';
import { TicketFilterQueryDto } from './ticket-filter-query.dto';

export class ListTicketsQueryDto extends TicketFilterQueryDto {
  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(12)
  @IsEnum(TicketStatus, { each: true })
  status?: TicketStatus[];

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
  @IsIn(ticketListSortFields)
  sort?: TicketListSortField;

  @IsOptional()
  @IsIn(ticketListSortDirections)
  dir?: TicketListSortDirection;

  /** Search the description as well as the number and the title. */
  @IsOptional()
  @Transform(({ value }) => toQueryBoolean(value))
  @IsBoolean()
  searchDescription?: boolean;

  /** 1-based page number; the route always answers `{ items, total, ... }`. */
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
