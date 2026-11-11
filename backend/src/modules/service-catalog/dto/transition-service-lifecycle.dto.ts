import { IsEnum } from "class-validator";
import { ServiceLifecycle } from "../../../generated/prisma/enums";
import { CatalogMutationReasonDto } from "./catalog-mutation-reason.dto";

export class TransitionServiceLifecycleDto extends CatalogMutationReasonDto {
  @IsEnum(ServiceLifecycle)
  lifecycle!: ServiceLifecycle;
}
