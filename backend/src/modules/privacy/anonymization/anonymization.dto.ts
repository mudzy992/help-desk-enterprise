import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AnonymizationIdParamDto {
  @IsString()
  @MaxLength(40)
  id!: string;
}

export class IdentityCodeDto {
  /** Current TOTP or recovery code (accounts with MFA). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[0-9A-Za-z-]{6,20}$/)
  code?: string;
}

export class RequestAnonymizationDto extends IdentityCodeDto {
  /** The user's e-mail typed by hand (§6.1 korak 4). */
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  confirmEmail!: string;

  @IsOptional()
  @IsBoolean()
  deleteOwnAttachments?: boolean;

  /** Optional link to an erasure request in the register (§4). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  requestId?: string;
}
