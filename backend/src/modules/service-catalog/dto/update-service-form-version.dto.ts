import { IsObject } from "class-validator";
import { CatalogMutationReasonDto } from "./catalog-mutation-reason.dto";

export class UpdateServiceFormVersionDto extends CatalogMutationReasonDto {
  @IsObject()
  schema!: Record<string, unknown>;
}
