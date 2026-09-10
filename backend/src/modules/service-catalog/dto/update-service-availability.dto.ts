import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ServiceAvailability } from '../../../generated/prisma/enums';
import { serviceAvailabilityConstants } from '../service-availability.constants';

export class UpdateServiceAvailabilityDto {
  @IsEnum(ServiceAvailability)
  availability!: ServiceAvailability;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(serviceAvailabilityConstants.maximumReasonLength)
  reason?: string;
}
