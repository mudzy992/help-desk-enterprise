import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { authenticationConstants } from '../../authentication/authentication.constants';
import { installLoginProviderConstants } from '../install-login-provider.constants';
import type { AuthenticationMode } from '../../authentication/authentication.types';

export class SaveInstallLoginProviderDto {
  @IsIn([...authenticationConstants.modes])
  mode!: AuthenticationMode;

  @IsOptional()
  @IsString()
  @MaxLength(installLoginProviderConstants.maximumDirectoryObjectIdLength)
  azureTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installLoginProviderConstants.maximumDirectoryObjectIdLength)
  azureClientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installLoginProviderConstants.maximumLdapsUrlsCsvLength)
  adLdapsUrlsCsv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installLoginProviderConstants.maximumBindDnLength)
  adBindDn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installLoginProviderConstants.maximumBindPasswordLength)
  adBindPassword?: string;
}
