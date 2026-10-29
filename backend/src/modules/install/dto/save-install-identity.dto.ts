import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { brandingLimits } from '../../branding/branding.constants';
import { installIdentityLocales } from '../install-identity.types';

/** F2: the wizard posts what it shows; empty optional fields are omitted. */
export class SaveInstallIdentityDto {
  @IsString()
  @MaxLength(brandingLimits.organizationNameMaxLength)
  organizationName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(brandingLimits.appNameMaxLength)
  appName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(brandingLimits.taglineMaxLength)
  tagline?: string;

  @IsOptional()
  @IsIn(installIdentityLocales)
  locale?: 'bs' | 'en';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsString()
  logoDataUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(brandingLimits.supportEmailMaxLength)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(brandingLimits.supportUrlMaxLength)
  supportUrl?: string;
}
