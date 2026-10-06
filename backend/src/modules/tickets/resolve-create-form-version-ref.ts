import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersionForService } from '../service-catalog/load-form-version';
import { selectActiveFormVersionRef } from '../service-catalog/select-active-form-version-ref';
import { ServiceFormsError } from '../service-catalog/service-forms.error';
import { defaultServiceFormsConfiguration } from '../service-catalog/service-forms.constants';
import type { ServiceFormsConfiguration } from '../service-catalog/service-forms.types';
import { TicketsError } from './tickets.error';

export async function resolveCreateFormVersionRef(
  prisma: PrismaService,
  input: {
    readonly serviceId: string;
    readonly formVersionRef?: string;
  },
  configuration: ServiceFormsConfiguration = defaultServiceFormsConfiguration,
): Promise<string | null> {
  if (!configuration.enabled) {
    return null;
  }

  const requested = input.formVersionRef?.trim() ?? '';
  try {
    let formVersionRef = requested;
    if (formVersionRef.length === 0) {
      try {
        formVersionRef = await selectActiveFormVersionRef(prisma, input.serviceId);
      } catch (error) {
        if (
          error instanceof ServiceFormsError &&
          error.code === 'NO_ACTIVE_FORM_VERSION' &&
          !configuration.requireVersionOnTicket
        ) {
          return null;
        }
        throw error;
      }
    }
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
