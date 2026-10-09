import { IsIn, IsString, MaxLength } from 'class-validator';
import { privacyNoticeMaxLength } from '../../settings/definitions/privacy-settings';

export class UpdatePrivacyNoticeDto {
  /** Empty text falls back to the generated draft on the public page. */
  @IsString()
  @MaxLength(privacyNoticeMaxLength)
  bs!: string;

  @IsString()
  @MaxLength(privacyNoticeMaxLength)
  en!: string;
}

export class PrivacyNoticeLocaleQueryDto {
  @IsIn(['bs', 'en'])
  locale?: 'bs' | 'en';
}
