import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedMissingPriorityMatrixCells } from './seed-priority-matrix';
import { seedStartingSlaProfiles } from './seed-starting-sla-profiles';

@Injectable()
export class StartingSlaSeedService implements OnModuleInit {
  private readonly logger = new Logger(StartingSlaSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await seedStartingSlaProfiles(this.prisma);
    const seededMatrixCells = await seedMissingPriorityMatrixCells(this.prisma);
    if (seededMatrixCells > 0) {
      this.logger.log(`Seeded ${seededMatrixCells} missing priority matrix cells`);
    }
  }
}
