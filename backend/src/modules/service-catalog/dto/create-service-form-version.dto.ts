import { IsObject } from "class-validator";
import { CatalogMutationReasonDto } from "./catalog-mutation-reason.dto";

export class CreateServiceFormVersionDto extends CatalogMutationReasonDto {
  @IsObject()
  schema!: Record<string, unknown>;
}
