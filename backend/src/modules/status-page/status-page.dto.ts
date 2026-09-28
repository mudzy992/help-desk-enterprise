import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  incidentImpacts,
  incidentStatuses,
  incidentVisibilities,
  statusPageLimits,
  type IncidentImpact,
  type IncidentStatus,
  type IncidentVisibility,
} from './status-page.model';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export class CreateIncidentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(statusPageLimits.titleMax)
  title!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(statusPageLimits.titleMax)
  titleEn?: string | null;

  @IsIn(incidentImpacts)
  impact!: IncidentImpact;

  @IsOptional()
  @IsIn(incidentVisibilities)
  visibility?: IncidentVisibility;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(statusPageLimits.servicesMax)
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds!: string[];

  /** First timeline entry ("Istražujemo …"). */
  @Transform(trim)
  @IsString()
  @MinLength(statusPageLimits.messageMin)
  @MaxLength(statusPageLimits.messageMax)
  message!: string;

  /** Back-dated start (the problem began before someone reported it); default now. */
  @IsOptional()
  @IsISO8601({ strict: true })
  startedAt?: string;

  /** In-app notice to users with an open ticket on the services (§8.3). */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notifyOpenTicketHolders?: boolean;

  /** "Create incident from selected" in the ticket list. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(statusPageLimits.ticketsPerCreateMax)
  @ArrayUnique()
  @IsString({ each: true })
  ticketIds?: string[];
}

export class UpdateIncidentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(statusPageLimits.titleMax)
  title?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(statusPageLimits.titleMax)
  titleEn?: string | null;

  @IsOptional()
  @IsIn(incidentImpacts)
  impact?: IncidentImpact;

  @IsOptional()
  @IsIn(incidentVisibilities)
  visibility?: IncidentVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(statusPageLimits.servicesMax)
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds?: string[];
}

export class AddIncidentUpdateDto {
  @IsIn(incidentStatuses)
  status!: IncidentStatus;

  @Transform(trim)
  @IsString()
  @MinLength(statusPageLimits.messageMin)
  @MaxLength(statusPageLimits.messageMax)
  message!: string;

  /** Only for RESOLVED: notify subscribers and requesters of linked tickets (default true). */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notifyOnResolve?: boolean;
}

export class LinkTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  ticketId!: string;
}

export class IncidentHistoryQueryDto {
  @IsOptional()
  @IsIn(['open', 'resolved', 'all'])
  scope?: 'open' | 'resolved' | 'all';
}
