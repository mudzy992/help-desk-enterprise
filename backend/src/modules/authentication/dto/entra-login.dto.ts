import { IsString, MaxLength, MinLength } from 'class-validator';

export class EntraLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  idToken!: string;
}
