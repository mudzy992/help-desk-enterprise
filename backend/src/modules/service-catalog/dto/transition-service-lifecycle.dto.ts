import { IsEnum } from 'class-validator';
import { ServiceLifecycle } from '../../../generated/prisma/enums';

export class TransitionServiceLifecycleDto {
  @IsEnum(ServiceLifecycle)
  lifecycle!: ServiceLifecycle;
}
