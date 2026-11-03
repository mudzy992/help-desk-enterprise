import { IsString, MaxLength, MinLength } from "class-validator";
import { serviceCatalogConstants } from "../service-catalog.constants";

export class CatalogMutationReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(serviceCatalogConstants.maximumChangeReasonLength)
  reason!: string;
}
