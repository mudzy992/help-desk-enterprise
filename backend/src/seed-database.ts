import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import type { PrismaService } from './common/prisma/prisma.service';
import { seedManualDirectoryCatalog } from './modules/directory-sync/seed-manual-directory-catalog';
import { seedStartingSlaProfiles } from './modules/sla/seed-starting-sla-profiles';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const prismaService = prisma as unknown as PrismaService;
    await seedStartingSlaProfiles(prismaService);
    await seedManualDirectoryCatalog(prismaService);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
