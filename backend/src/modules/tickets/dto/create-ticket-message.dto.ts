import { IsEnum, IsString, MaxLength, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { MessageType } from '../../../generated/prisma/enums';
import { ticketConstants } from '../tickets.constants';

export class CreateTicketMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumMessageBodyLength)
  body!: string;

  /** Package 1.2 (M4) */
  @IsOptional()
  @IsBoolean()
  alsoToMerged?: boolean;

  /** Package 1.4 (T4) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  responseTemplateId?: string;
}
