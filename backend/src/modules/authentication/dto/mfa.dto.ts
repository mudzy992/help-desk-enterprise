import { IsString, Length, MaxLength, MinLength } from 'class-validator';

/** Paket 2.1: a TOTP (6 digits) or a recovery code (xxxxx-xxxxx). */
const CODE_MIN = 6;
const CODE_MAX = 16;

export class MfaTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  mfaToken!: string;
}

export class MfaCodeDto extends MfaTokenDto {
  @IsString()
  @Length(CODE_MIN, CODE_MAX)
  code!: string;
}

export class AccountMfaCodeDto {
  @IsString()
  @Length(CODE_MIN, CODE_MAX)
  code!: string;
}

export class AccountPasswordChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  newPassword!: string;
}

export class AdminSecurityReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
