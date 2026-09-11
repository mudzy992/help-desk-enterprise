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
  TicketUrgency,
} from '../../../generated/prisma/enums';
import { ticketConstants } from '../tickets.constants';

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumTitleLength)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumDescriptionLength)
  description!: string;

  @IsEnum(TicketImpact)
  impact!: TicketImpact;

  @IsEnum(TicketUrgency)
  urgency!: TicketUrgency;

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  formVersionRef?: string;

  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;
}
