import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { executeSlaOperation } from './execute-sla-operation';
import { listPriorityMatrix } from './list-priority-matrix';
import { listSlaChangeLogs } from './list-sla-change-logs';
import {
  patchPriorityMatrix,
  type PatchPriorityMatrixInput,
} from './patch-priority-matrix';
import { slaChangeLogEntityTypes } from './sla.constants';
import type {
  SlaChangeLogResponse,
  SlaMutationContext,
} from './sla.types';

@Injectable()
export class PriorityMatrixService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Awaited<ReturnType<typeof listPriorityMatrix>>> {
    return executeSlaOperation(() => listPriorityMatrix(this.prisma));
  }

  patch(
    input: PatchPriorityMatrixInput,
    context: SlaMutationContext,
  ): Promise<Awaited<ReturnType<typeof listPriorityMatrix>>> {
    return executeSlaOperation(() =>
      patchPriorityMatrix(this.prisma, input, context),
    );
  }

  listChanges(): Promise<readonly SlaChangeLogResponse[]> {
    return executeSlaOperation(() =>
      listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.priorityMatrix,
        entityId: 'global',
      }),
    );
  }
}
