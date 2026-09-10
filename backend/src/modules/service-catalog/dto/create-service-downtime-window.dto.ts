import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { serviceAvailabilityConstants } from '../service-availability.constants';

export class CreateServiceDowntimeWindowDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(serviceAvailabilityConstants.maximumMessageLength)
  message!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(serviceAvailabilityConstants.maximumReasonLength)
  reason?: string;
}
