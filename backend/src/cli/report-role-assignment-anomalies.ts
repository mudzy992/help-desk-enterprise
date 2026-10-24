import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '../generated/prisma/client';
import { analyzeRoleAssignments } from '../common/principal-context/role-assignment-analyzer';

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1]?.trim() : undefined;
  if (!output) throw new Error('--output <manifest.json> is required');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.userRole.findMany({
      select: { id: true, userId: true, roleId: true, organizationalUnitId: true, serviceId: true, role: { select: { key: true } }, user: { select: { isActive: true, isLocalOnly: true } } },
      orderBy: { id: 'asc' },
    });
    const manifest = analyzeRoleAssignments(rows.map((row) => ({
      id: row.id, userId: row.userId, roleId: row.roleId, roleKey: row.role.key,
      userIsActive: row.user.isActive, userIsLocalOnly: row.user.isLocalOnly,
      organizationalUnitId: row.organizationalUnitId, serviceId: row.serviceId,
    })));
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`role_assignment_report rows=${manifest.rowCount} anomalies=${manifest.anomalies.length} mode=report-only`);
    process.exitCode = manifest.anomalies.length === 0 ? 0 : 2;
  } finally { await prisma.$disconnect(); }
}
void main();
