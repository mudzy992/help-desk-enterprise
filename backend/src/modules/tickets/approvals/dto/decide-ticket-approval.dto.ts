import { IsString, MaxLength, MinLength } from 'class-validator';
import { ticketApprovalConstants } from '../approvals.constants';
import type { DecideTicketApprovalInput } from '../approvals.types';

export class DecideTicketApprovalDto implements DecideTicketApprovalInput {
  @IsString()
  @MinLength(1)
  @MaxLength(ticketApprovalConstants.maximumCommentLength)
  comment!: string;
}
