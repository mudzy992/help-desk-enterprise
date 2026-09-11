import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { installSmtpConstants } from '../install-smtp.constants';
import type { SaveInstallSmtpInput } from '../install-smtp.types';

export class SaveInstallSmtpDto implements SaveInstallSmtpInput {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(installSmtpConstants.maximumHostLength)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(installSmtpConstants.minimumPort)
  @Max(installSmtpConstants.maximumPort)
  port?: number;

  @IsOptional()
  @IsBoolean()
  tls?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(installSmtpConstants.maximumUsernameLength)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installSmtpConstants.maximumPasswordLength)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installSmtpConstants.maximumFromAddressLength)
  fromAddress?: string;
}
