import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ticketSplitConstants } from '../split.constants';
import type { SplitTicketInput } from '../split.types';
import { SplitTicketChildDto } from './split-ticket-child.dto';

export class SplitTicketDto implements SplitTicketInput {
  @IsOptional()
  @IsString()
  @MaxLength(ticketSplitConstants.maximumReasonLength)
  reason?: string;

  @IsArray()
  @ArrayMinSize(ticketSplitConstants.minimumChildren)
  @ArrayMaxSize(ticketSplitConstants.maximumChildren)
  @ValidateNested({ each: true })
  @Type(() => SplitTicketChildDto)
  children!: SplitTicketChildDto[];
}
