import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  aggregateSlaCompliance,
  resolveSlaComplianceWindow,
} from './aggregate-sla-compliance';
import {
  loadSlaComplianceProfiles,
  loadSlaComplianceTicketRows,
} from './load-sla-compliance-rows';
import type { SlaComplianceResponse } from './sla-compliance.types';

@Injectable()
export class SlaComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompliance(input: {
    readonly days?: number;
    readonly now?: Date;
  }): Promise<SlaComplianceResponse> {
    const window = resolveSlaComplianceWindow({
      days: input.days,
      now: input.now ?? new Date(),
    });
    const [profiles, rows] = await Promise.all([
      loadSlaComplianceProfiles(this.prisma),
      loadSlaComplianceTicketRows(this.prisma, window),
    ]);
    return aggregateSlaCompliance({ profiles, rows, window });
  }
}
