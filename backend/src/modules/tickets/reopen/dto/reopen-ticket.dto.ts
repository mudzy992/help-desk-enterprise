import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ticketReopenConstants } from '../reopen.constants';
import type { ReopenTicketInput } from '../reopen.types';

export class ReopenTicketDto implements ReopenTicketInput {
  @IsOptional()
  @IsString()
  @MaxLength(ticketReopenConstants.maximumCommentLength)
  comment?: string;
}
