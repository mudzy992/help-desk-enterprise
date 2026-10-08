import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';
import type { SettingValue } from '../settings.types';

export class UpdateSettingDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsDefined()
  value!: SettingValue;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;

  /** Paket 5.3.3 (D7): same confirmation as the batch route, one key at a time. */
  @IsOptional()
  @IsBoolean()
  resetDependents?: boolean;
}
