import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import { loadServiceDowntimeWindows } from './load-service-downtime-windows';
import type { DowntimeWindowResponse } from './service-availability.types';
import { toDowntimeWindowResponse } from './to-downtime-window-response';

export async function listServiceDowntimeWindows(
  prisma: PrismaService,
  serviceId: string,
  now: Date,
): Promise<readonly DowntimeWindowResponse[]> {
  await loadService(prisma, serviceId);
  const windows = await loadServiceDowntimeWindows(prisma, serviceId);
  return windows.map((window) => toDowntimeWindowResponse(window, now));
}
