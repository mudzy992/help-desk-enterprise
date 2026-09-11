import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
} from 'class-validator';
import { ticketBulkConstants } from '../bulk.constants';

export class PreviewTicketBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ticketBulkConstants.maximumTicketIds)
  @IsString({ each: true })
  ticketIds!: string[];
}
