import {
  IsBoolean,
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

  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicate?: boolean;

  /** Paket 3.2 (§8): the requester's own equipment the ticket is about. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assetId?: string;
}
