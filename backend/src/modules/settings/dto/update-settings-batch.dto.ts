import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';
import type { SettingValue } from '../settings.types';

export class SettingsBatchEntryDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsDefined()
  value!: SettingValue;
}

/** Paket 4.1: several keys under one reason, saved all-or-nothing. */
export class UpdateSettingsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SettingsBatchEntryDto)
  entries!: SettingsBatchEntryDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}
