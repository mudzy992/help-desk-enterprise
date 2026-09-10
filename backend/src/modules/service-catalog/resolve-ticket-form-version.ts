import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersion } from './load-form-version';
import { parseFormSchema } from './parse-form-schema';
import { ServiceFormsError } from './service-forms.error';
import type { TicketFormVersionBinding } from './service-forms.types';

export async function resolveTicketFormVersion(
  prisma: PrismaService,
  ticketId: string,
): Promise<TicketFormVersionBinding> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      serviceId: true,
      formVersionId: true,
    },
  });
  if (ticket === null) {
    throw new ServiceFormsError('TICKET_NOT_FOUND');
  }
  const formVersion = await loadFormVersion(prisma, ticket.formVersionId);
  return {
    ticketId: ticket.id,
    serviceId: ticket.serviceId,
    formVersionRef: formVersion.id,
    schema: parseFormSchema(formVersion.schema),
  };
}
