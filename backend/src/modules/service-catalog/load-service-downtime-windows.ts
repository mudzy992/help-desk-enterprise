import { PrismaService } from '../../common/prisma/prisma.service';
import type { DowntimeWindowRecord } from './service-availability.types';

export async function loadServiceDowntimeWindows(
  prisma: PrismaService,
  serviceId: string,
): Promise<readonly DowntimeWindowRecord[]> {
  return prisma.serviceDowntimeWindow.findMany({
    where: { serviceId },
    orderBy: [{ startsAt: 'asc' }],
  });
}

export async function loadServiceDowntimeWindowsForServices(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, readonly DowntimeWindowRecord[]>> {
  if (serviceIds.length === 0) {
    return new Map();
  }
  const windows = await prisma.serviceDowntimeWindow.findMany({
    where: { serviceId: { in: [...serviceIds] } },
    orderBy: [{ startsAt: 'asc' }],
  });
  const grouped = new Map<string, DowntimeWindowRecord[]>();
  for (const window of windows) {
    const existing = grouped.get(window.serviceId) ?? [];
    existing.push(window);
    grouped.set(window.serviceId, existing);
  }
  return grouped;
}
