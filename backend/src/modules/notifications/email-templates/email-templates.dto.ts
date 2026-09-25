import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';
import { emailLocales, emailTemplateKeys } from '../email/email-template.constants';

export class UpdateEmailTemplatesDto {
  /** `{ bs?: { key?: { field?: text } }, en?: … }` — only the changed texts. */
  @IsObject()
  overrides!: Record<string, unknown>;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class PreviewEmailTemplateDto {
  @IsIn(emailTemplateKeys)
  key!: (typeof emailTemplateKeys)[number];

  @IsIn(emailLocales)
  locale!: (typeof emailLocales)[number];

  /** Unsaved texts from the editor for this key/locale (validated like saved ones). */
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  confidential?: boolean;
}

export class SendTestEmailDto extends PreviewEmailTemplateDto {}
