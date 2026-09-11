import {
  IsDefined,
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
}
