import { IsOptional, IsString, Length } from 'class-validator';

/** `POST /install/smtp/test` — an empty body sends to the founder's address. */
export class SendInstallSmtpTestDto {
  @IsOptional()
  @IsString()
  @Length(3, 254)
  toAddress?: string;
}
