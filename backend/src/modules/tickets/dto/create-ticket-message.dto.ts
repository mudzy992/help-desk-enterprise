import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { MessageType } from '../../../generated/prisma/enums';
import { ticketConstants } from '../tickets.constants';

export class CreateTicketMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumMessageBodyLength)
  body!: string;
}
