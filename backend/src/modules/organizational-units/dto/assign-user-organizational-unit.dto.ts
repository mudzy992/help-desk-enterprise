import { IsDefined, IsString, MinLength, ValidateIf } from 'class-validator';

export class AssignUserOrganizationalUnitDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string | null;
}
