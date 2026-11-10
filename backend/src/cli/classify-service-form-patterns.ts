import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { classifyServiceFormPatternInventory } from '../modules/service-catalog/classify-service-form-pattern-inventory';

const pageSize = 200;

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1]?.trim() : undefined;
  if (outputIndex >= 0 && !output) throw new Error('--output requires a new file path');
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for this read-only inventory');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    let formVersionCount = 0;
    let formsWithPatterns = 0;
    let safePatternCount = 0;
    let unsafePatternCount = 0;
    const patterns = [] as ReturnType<
      typeof classifyServiceFormPatternInventory
    >['patterns'][number][];
    let afterId: string | undefined;
    while (true) {
      const page = await prisma.formVersion.findMany({
        ...(afterId === undefined ? {} : { where: { id: { gt: afterId } } }),
        orderBy: { id: 'asc' },
        take: pageSize,
        select: { id: true, serviceId: true, version: true, status: true, schema: true },
      });
      const pageReport = classifyServiceFormPatternInventory(page);
      formVersionCount += pageReport.formVersionCount;
      formsWithPatterns += pageReport.formsWithPatterns;
      safePatternCount += pageReport.safePatternCount;
      unsafePatternCount += pageReport.unsafePatternCount;
      patterns.push(...pageReport.patterns);
      if (page.length < pageSize) break;
      afterId = page[page.length - 1]?.id;
    }
    const report = {
      formVersionCount,
      formsWithPatterns,
      patternCount: safePatternCount + unsafePatternCount,
      safePatternCount,
      unsafePatternCount,
      patterns,
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (output) {
      await writeFile(output, serialized, { flag: 'wx', mode: 0o600 });
    } else {
      process.stdout.write(serialized);
    }
    console.error(
      `service_form_pattern_inventory mode=read-only forms=${report.formVersionCount} patterns=${report.patternCount} safe=${report.safePatternCount} unsafe=${report.unsafePatternCount}`,
    );
    process.exitCode = report.unsafePatternCount === 0 ? 0 : 2;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  console.error(
    'service_form_pattern_inventory failed; verify DATABASE_URL and read access without sharing credentials.',
  );
  process.exitCode = 1;
});
