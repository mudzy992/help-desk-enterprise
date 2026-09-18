import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../../generated/prisma/enums';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';

export class PriorityMatrixCellDto {
  @IsEnum(TicketImpact)
  impact!: TicketImpact;

  @IsEnum(TicketUrgency)
  urgency!: TicketUrgency;

  @IsEnum(TicketPriority)
  priority!: TicketPriority;
}

export class PatchPriorityMatrixDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PriorityMatrixCellDto)
  cells!: PriorityMatrixCellDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}
