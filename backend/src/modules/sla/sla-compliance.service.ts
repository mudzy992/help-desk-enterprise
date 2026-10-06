import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  aggregateSlaCompliance,
  resolveSlaComplianceWindow,
} from './aggregate-sla-compliance';
import {
  loadSlaComplianceProfiles,
  loadSlaComplianceRows,
} from './load-sla-compliance-rows';
import { resolveSlaComplianceUnitScope } from './resolve-sla-compliance-unit-scope';
import type { SlaComplianceResponse } from './sla-compliance.types';

@Injectable()
export class SlaComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompliance(input: {
    readonly organizationalUnitId: string;
    readonly days?: number;
    readonly now?: Date;
  }): Promise<SlaComplianceResponse> {
    const window = resolveSlaComplianceWindow({
      days: input.days,
      now: input.now ?? new Date(),
    });
    const [organizationalUnitIds, profiles] = await Promise.all([
      resolveSlaComplianceUnitScope(this.prisma, input.organizationalUnitId),
      loadSlaComplianceProfiles(this.prisma),
    ]);
    const { rows, openBreached } = await loadSlaComplianceRows(this.prisma, {
      window,
      organizationalUnitIds,
    });
    return aggregateSlaCompliance({ profiles, rows, window, openBreached });
  }
}
