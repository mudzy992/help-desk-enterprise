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
import { loadBoundedSlaCompliance, supportsBoundedSlaCompliance } from './load-bounded-sla-compliance';
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
    const organizationalUnitIds = await resolveSlaComplianceUnitScope(
      this.prisma,
      input.organizationalUnitId,
    );
    if (supportsBoundedSlaCompliance(this.prisma)) {
      return this.prisma.$transaction(
        (transaction) => loadBoundedSlaCompliance(
          transaction as unknown as PrismaService,
          { window, organizationalUnitIds },
        ),
        { timeout: 10_000, maxWait: 2_000 },
      );
    }
    // Explicit compatibility path for the deterministic in-memory domain harness.
    const profiles = await loadSlaComplianceProfiles(this.prisma);
    const { rows, openBreached } = await loadSlaComplianceRows(this.prisma, { window, organizationalUnitIds });
    return aggregateSlaCompliance({ profiles, rows, window, openBreached });
  }
}
