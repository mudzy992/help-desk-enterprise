import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { serviceCatalogConstants } from "../service-catalog.constants";
import { CatalogMutationReasonDto } from "./catalog-mutation-reason.dto";

export class CreateServiceCategoryDto extends CatalogMutationReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(serviceCatalogConstants.maximumNameLength)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(serviceCatalogConstants.maximumSlugLength)
  slug!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  parentId?: string | null;
}
