import { IsObject } from "class-validator";
import { CatalogMutationReasonDto } from "./catalog-mutation-reason.dto";

export class CreateServiceFormDto extends CatalogMutationReasonDto {
  @IsObject()
  schema!: Record<string, unknown>;
}
