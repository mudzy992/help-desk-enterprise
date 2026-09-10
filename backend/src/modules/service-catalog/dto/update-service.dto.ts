import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AutoAssignStrategy,
  DataClassification,
} from '../../../generated/prisma/enums';
import { serviceCatalogConstants } from '../service-catalog.constants';

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(serviceCatalogConstants.maximumNameLength)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

  @IsOptional()
  @IsEnum(DataClassification)
  classification?: DataClassification;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isConfidentialDefault?: boolean;

  @IsOptional()
  @IsEnum(AutoAssignStrategy)
  autoAssignStrategy?: AutoAssignStrategy;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  policyPackId?: string | null;
}
