import { Prisma } from '../../generated/prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ConfigVersionStatus } from '../../generated/prisma/enums';
import type { ConfigSnapshot } from './config-versioning.types';
import type { ConfigVersionRecord } from './to-config-version-response';

@Injectable()
export class ConfigVersioningRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ConfigVersionRecord[]> {
    return this.prisma.configVersion.findMany({
      orderBy: { version: 'desc' },
    });
  }

  findById(id: string): Promise<ConfigVersionRecord | null> {
    return this.prisma.configVersion.findUnique({ where: { id } });
  }

  findByVersion(version: number): Promise<ConfigVersionRecord | null> {
    return this.prisma.configVersion.findUnique({ where: { version } });
  }

  findActive(): Promise<ConfigVersionRecord | null> {
    return this.prisma.configVersion.findFirst({
      where: { status: 'ACTIVE' },
    });
  }

  async nextVersionNumber(): Promise<number> {
    const latest = await this.prisma.configVersion.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }

  create(input: {
    readonly version: number;
    readonly snapshot: ConfigSnapshot;
    readonly releaseNotes: string | null;
    readonly createdByUserId: string | null;
    readonly status?: ConfigVersionStatus;
  }): Promise<ConfigVersionRecord> {
    return this.prisma.configVersion.create({
      data: {
        version: input.version,
        status: input.status ?? 'DRAFT',
        snapshot: input.snapshot as Prisma.InputJsonValue,
        releaseNotes: input.releaseNotes,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  updateStatus(
    id: string,
    status: ConfigVersionStatus,
  ): Promise<ConfigVersionRecord> {
    return this.prisma.configVersion.update({
      where: { id },
      data: { status },
    });
  }
}
