import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ticketListPaging } from '../list/list-tickets.constants';

export class ListInboxQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string;

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
