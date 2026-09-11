import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';
import { slaConstants } from '../sla.constants';

export class CreateSlaProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumKeyLength)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumNameLength)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(slaConstants.maximumDescriptionLength)
  description?: string | null;

  @IsString()
  @MinLength(1)
  calendarId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class UpdateSlaProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumNameLength)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(slaConstants.maximumDescriptionLength)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  calendarId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}
