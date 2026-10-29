import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  installTeamLimits,
  installTeamRoleKeys,
  type InstallTeamRoleKey,
} from '../install-team.constants';

export class InstallTeamMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(installTeamLimits.maxDisplayNameLength)
  displayName!: string;

  @IsEmail()
  @MaxLength(installTeamLimits.maxEmailLength)
  email!: string;

  @IsIn(installTeamRoleKeys)
  roleKey!: InstallTeamRoleKey;
}

/** F2: `POST /install/team` — the rows the operator filled in. */
export class SaveInstallTeamDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(installTeamLimits.maxMembers)
  @ValidateNested({ each: true })
  @Type(() => InstallTeamMemberDto)
  members!: InstallTeamMemberDto[];
}
