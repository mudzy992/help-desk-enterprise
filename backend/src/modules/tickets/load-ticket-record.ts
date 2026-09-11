import { PrismaService } from '../../common/prisma/prisma.service';
import { isServiceOfferedToRequesters } from '../service-catalog/assert-service-lifecycle-transition';
import { RoutingError } from '../routing/routing.error';
import { TicketsError } from './tickets.error';
import type { TicketRecord } from './tickets.types';

export async function loadTicketRecord(
  prisma: PrismaService,
  ticketId: string,
): Promise<TicketRecord> {
  const record = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });
  if (record === null) {
    throw new TicketsError('NOT_FOUND');
  }
  return record as TicketRecord;
}

export async function loadOfferedService(
  prisma: PrismaService,
  serviceId: string,
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      lifecycle: true,
      classification: true,
      isConfidentialDefault: true,
    },
  });
  if (service === null) {
    throw new TicketsError('SERVICE_NOT_FOUND');
  }
  if (!isServiceOfferedToRequesters(service.lifecycle)) {
    throw new TicketsError('SERVICE_NOT_OFFERED');
  }
  return service;
}

export function mapCreateDependencyError(error: unknown): never {
  if (error instanceof RoutingError) {
    if (error.code === 'ORIGIN_UNIT_NOT_FOUND') {
      throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
    }
    if (error.code === 'SERVICE_NOT_FOUND') {
      throw new TicketsError('SERVICE_NOT_FOUND');
    }
  }
  throw error;
}
