import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import { humanizeCloseCodeKey } from './close-codes.constants';
import type {
  CloseCodeDescriptor,
  CloseCodeRecord,
  TicketCloseCodesConfiguration,
} from './close-codes.types';

export function toCloseCodeDescriptor(
  record: Pick<CloseCodeRecord, 'key' | 'name'>,
): CloseCodeDescriptor {
  return { key: record.key, name: record.name };
}

export function listConfiguredCloseCodes(
  configuration: TicketCloseCodesConfiguration,
): readonly CloseCodeDescriptor[] {
  return configuration.allowedCodes.map((key) => ({
    key,
    name: humanizeCloseCodeKey(key),
  }));
}

export async function resolveCloseCodeRecord(
  prisma: PrismaService,
  key: string,
  configuration: TicketCloseCodesConfiguration,
  serviceId: string,
): Promise<CloseCodeRecord> {
  if (!configuration.allowedCodes.includes(key)) {
    const serviceCode = await prisma.closeCode.findFirst({
      where: { key, serviceId, isActive: true },
    });
    if (serviceCode === null) {
      throw new TicketsError('CLOSE_CODE_INVALID');
    }
    return serviceCode as CloseCodeRecord;
  }
  const existing = await prisma.closeCode.findUnique({ where: { key } });
  if (existing !== null) {
    return existing as CloseCodeRecord;
  }
  return prisma.closeCode.create({
    data: {
      key,
      name: humanizeCloseCodeKey(key),
      isActive: true,
    },
  }) as Promise<CloseCodeRecord>;
}

export async function loadCloseCodesByIds(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<ReadonlyMap<string, CloseCodeDescriptor>> {
  const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const records = (await prisma.closeCode.findMany({
    where: { id: { in: [...uniqueIds] } },
  })) as CloseCodeRecord[];
  return new Map(
    records.map((record) => [record.id, toCloseCodeDescriptor(record)]),
  );
}
