import { IsString, MinLength } from 'class-validator';
import { localPasswordConstants } from '../is-valid-local-password';

export class ChangePasswordDto {
  @IsString()
  @MinLength(localPasswordConstants.minimumLength)
  newPassword!: string;
}
