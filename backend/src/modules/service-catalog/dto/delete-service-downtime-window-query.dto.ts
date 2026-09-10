import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { serviceAvailabilityConstants } from '../service-availability.constants';

export class DeleteServiceDowntimeWindowQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(serviceAvailabilityConstants.maximumReasonLength)
  reason?: string;
}
