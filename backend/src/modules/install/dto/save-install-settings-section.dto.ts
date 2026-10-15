import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDefined, IsIn, IsString, ValidateNested } from 'class-validator';
import {
  installSettingsSectionKeys,
  type InstallSettingsSectionKey,
} from '../sections/install-settings-section.keys';
import { installSettingsSectionConstants } from '../sections/install-settings-section.constants';

/** `GET/POST /install/sections/:sectionKey` — a registry key, never a free string. */
export class InstallSettingsSectionParamDto {
  @IsIn(installSettingsSectionKeys satisfies readonly InstallSettingsSectionKey[])
  sectionKey!: InstallSettingsSectionKey;
}

/**
 * F5: one field of a save. Which of the three value types a key accepts — and its
 * range, allowed values and `requires` — stays the registry's answer: the wizard
 * does not keep a second copy of those rules, so the DTO only insists that a
 * value is there at all.
 */
export class InstallSettingsSectionValueDto {
  @IsString()
  key!: string;

  @IsDefined()
  value!: string | number | boolean;
}

export class SaveInstallSettingsSectionDto {
  @IsArray()
  @ArrayMaxSize(installSettingsSectionConstants.maxValuesPerSave)
  @ValidateNested({ each: true })
  @Type(() => InstallSettingsSectionValueDto)
  values!: InstallSettingsSectionValueDto[];
}
