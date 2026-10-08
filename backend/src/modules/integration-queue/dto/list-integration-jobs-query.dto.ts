import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { IntegrationJobStatus } from '../../../generated/prisma/enums';
import { integrationQueueAdminStatuses } from '../integration-queue.constants';

export class ListIntegrationJobsQueryDto {
  @IsIn([...integrationQueueAdminStatuses])
  status!: IntegrationJobStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;
}
