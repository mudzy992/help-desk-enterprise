import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { TicketPriority } from '../../../../generated/prisma/enums';
import { ticketMergeConstants } from '../merge.constants';

export class OverrideTicketPriorityDto {
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: TicketPriority;

  @IsOptional()
  @IsBoolean()
  resetToMatrix?: boolean;

  @IsString()
  @MaxLength(ticketMergeConstants.maximumReasonLength)
  reason!: string;
}

export class MergeTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  parentTicketId!: string;

  @IsString()
  @MaxLength(ticketMergeConstants.maximumReasonLength)
  reason!: string;
}

export class UnmergeTicketDto {
  @IsString()
  @MaxLength(ticketMergeConstants.maximumReasonLength)
  reason!: string;
}

export class MergeCandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
