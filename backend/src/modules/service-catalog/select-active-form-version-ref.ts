import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceFormsError } from './service-forms.error';

export async function selectActiveFormVersionRef(
  prisma: PrismaService,
  serviceId: string,
): Promise<string> {
  const active = await prisma.formVersion.findFirst({
    where: { serviceId, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (active === null) {
    throw new ServiceFormsError('NO_ACTIVE_FORM_VERSION');
  }
  return active.id;
}
