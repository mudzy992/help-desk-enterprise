import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceFormsError } from './service-forms.error';
import type { FormVersionRecord } from './service-forms.types';

export async function loadFormVersion(
  prisma: PrismaService,
  formVersionRef: string,
): Promise<FormVersionRecord> {
  const record = await prisma.formVersion.findUnique({
    where: { id: formVersionRef },
  });
  if (record === null) {
    throw new ServiceFormsError('FORM_VERSION_NOT_FOUND');
  }
  return record;
}

export async function loadFormVersionForService(
  prisma: PrismaService,
  serviceId: string,
  formVersionRef: string,
): Promise<FormVersionRecord> {
  const record = await loadFormVersion(prisma, formVersionRef);
  if (record.serviceId !== serviceId) {
    throw new ServiceFormsError('FORM_VERSION_SERVICE_MISMATCH');
  }
  return record;
}
