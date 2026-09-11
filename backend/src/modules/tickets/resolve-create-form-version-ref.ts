import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersionForService } from '../service-catalog/load-form-version';
import { selectActiveFormVersionRef } from '../service-catalog/select-active-form-version-ref';
import { ServiceFormsError } from '../service-catalog/service-forms.error';
import { TicketsError } from './tickets.error';

export async function resolveCreateFormVersionRef(
  prisma: PrismaService,
  input: {
    readonly serviceId: string;
    readonly formVersionRef?: string;
  },
): Promise<string> {
  const requested = input.formVersionRef?.trim() ?? '';
  try {
    const formVersionRef =
      requested.length === 0
        ? await selectActiveFormVersionRef(prisma, input.serviceId)
        : requested;
    const formVersion = await loadFormVersionForService(
      prisma,
      input.serviceId,
      formVersionRef,
    );
    if (formVersion.status !== 'ACTIVE') {
      throw new TicketsError('FORM_VERSION_NOT_ACTIVE');
    }
    return formVersion.id;
  } catch (error) {
    throw mapFormVersionError(error);
  }
}

function mapFormVersionError(error: unknown): never {
  if (error instanceof TicketsError) {
    throw error;
  }
  if (error instanceof ServiceFormsError) {
    if (error.code === 'TICKET_FORM_VERSION_REQUIRED') {
      throw new TicketsError('FORM_VERSION_REQUIRED');
    }
    if (error.code === 'NO_ACTIVE_FORM_VERSION') {
      throw new TicketsError('FORM_VERSION_REQUIRED');
    }
    if (error.code === 'FORM_VERSION_NOT_FOUND') {
      throw new TicketsError('FORM_VERSION_NOT_FOUND');
    }
    if (error.code === 'FORM_VERSION_SERVICE_MISMATCH') {
      throw new TicketsError('FORM_VERSION_SERVICE_MISMATCH');
    }
  }
  throw error;
}
