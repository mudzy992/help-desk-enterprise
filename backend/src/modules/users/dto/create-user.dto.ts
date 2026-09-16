import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import type { CreateUserInput } from '../users.types';

export class CreateUserDto implements Omit<
  CreateUserInput,
  'actorUserId' | 'actorIsSuperAdmin' | 'requestId'
> {
  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  organizationalUnitId?: string | null;

  @IsString()
  @MinLength(1)
  roleKey!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
