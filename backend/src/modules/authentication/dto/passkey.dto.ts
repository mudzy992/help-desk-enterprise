import { IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { MfaTokenDto } from './mfa.dto';

/**
 * Paket 5.4.0-a (M1): the browser posts the WebAuthn JSON payloads as opaque
 * objects — the server validates them inside the verification call, where the
 * library checks origin/RP ID/challenge/signature. Field-level validation
 * here would only duplicate the WebAuthn spec.
 */
export class PasskeyAuthenticationDto extends MfaTokenDto {
  @IsObject()
  assertion!: Record<string, unknown>;
}

export class PasskeyRegistrationConfirmDto {
  @IsObject()
  response!: Record<string, unknown>;

  /**
   * Optional TOTP code: required when the account already has TOTP, so a
   * stolen session alone cannot add a factor; absent when passkey is the
   * account's first/only factor (the attestation itself proves the device).
   */
  @IsOptional()
  @IsString()
  @Length(6, 16)
  @MaxLength(16)
  code?: string;
}
