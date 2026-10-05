import {
  IsBoolean,
  IsEnum,
  IsISO8601,
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

  /** M8 #3 (val 5): RAW's explicit request type. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ticketConstants.maximumRequestTypeLength)
  requestType?: string;

  /** M8 #3 (val 5): requested deadline (ISO-8601), separate from the SLA. */
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

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
