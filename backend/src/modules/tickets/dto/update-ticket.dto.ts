import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  TicketImpact,
  TicketStatus,
  TicketUrgency,
} from '../../../generated/prisma/enums';
import { ticketConstants } from '../tickets.constants';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumTitleLength)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumDescriptionLength)
  description?: string;

  @IsOptional()
  @IsEnum(TicketImpact)
  impact?: TicketImpact;

  @IsOptional()
  @IsEnum(TicketUrgency)
  urgency?: TicketUrgency;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  closeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
