import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { installSuperAdminConstants } from '../install-super-admin.constants';

export class CreateInstallSuperAdminDto {
  @IsEmail()
  @MaxLength(installSuperAdminConstants.maximumEmailLength)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(installSuperAdminConstants.maximumDisplayNameLength)
  displayName!: string;

  @IsString()
  @MinLength(installSuperAdminConstants.minimumPasswordLength)
  @MaxLength(installSuperAdminConstants.maximumPasswordLength)
  password!: string;
}
