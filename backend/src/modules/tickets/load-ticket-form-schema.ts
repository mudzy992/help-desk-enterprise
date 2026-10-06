import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersion } from '../service-catalog/load-form-version';
import { parseFormSchema } from '../service-catalog/parse-form-schema';
import type { ServiceFormSchema } from '../service-catalog/form-schema.types';

export async function loadTicketFormSchema(
  prisma: PrismaService,
  formVersionId: string | null,
): Promise<ServiceFormSchema | null> {
  if (formVersionId === null) {
    return null;
  }
  const formVersion = await loadFormVersion(prisma, formVersionId);
  return parseFormSchema(formVersion.schema);
}
