import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedStartingSlaProfiles } from './seed-starting-sla-profiles';

@Injectable()
export class StartingSlaSeedService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await seedStartingSlaProfiles(this.prisma);
  }
}
