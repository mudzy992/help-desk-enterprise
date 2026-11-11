import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { assertFormVersioningEnabled } from "./assert-service-forms-enabled";
import { isFormVersionUniqueConflict } from "./is-form-version-unique-conflict";
import { loadLatestFormVersionNumber } from "./list-form-version-records";
import { loadService } from "./load-service";
import { normalizeCatalogMutationReason } from "./normalize-catalog-mutation-reason";
import { parseConfiguredFormSchema } from "./parse-configured-form-schema";
import { recordServiceCatalogChange } from "./record-service-catalog-change";
import {
  serviceFormsChangeLogEntityType,
  serviceFormsChangeLogReasons,
} from "./service-forms.constants";
import { ServiceFormsError } from "./service-forms.error";
import type { CatalogMutationContext } from "./service-catalog.types";
import type {
  CreateServiceFormVersionInput,
  FormVersionResponse,
  ServiceFormsConfiguration,
} from "./service-forms.types";
import { toFormVersionResponse } from "./to-form-version-response";
import { withServiceFormVersionMutationLock } from "./with-service-form-activation-lock";

const maximumVersionAllocationAttempts = 3;

export async function createServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
  input: CreateServiceFormVersionInput,
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<FormVersionResponse> {
  assertFormVersioningEnabled(configuration);
  await loadService(prisma, serviceId);
  const schema = parseConfiguredFormSchema(input.schema, configuration);
  const reason = normalizeCatalogMutationReason({
    reason: input.reason,
    context,
    systemFallback: serviceFormsChangeLogReasons.formVersionCreate,
  });

  for (
    let attempt = 0;
    attempt < maximumVersionAllocationAttempts;
    attempt += 1
  ) {
    try {
      const created = await prisma.$transaction(
        (transaction) =>
          withServiceFormVersionMutationLock(
            transaction,
            serviceId,
            async () => {
              await loadService(transaction as PrismaService, serviceId);
              const latestVersion = await loadLatestFormVersionNumber(
                transaction as PrismaService,
                serviceId,
              );
              if (latestVersion === 0) {
                throw new ServiceFormsError("FORM_NOT_FOUND");
              }
              const version = await transaction.formVersion.create({
                data: {
                  serviceId,
                  version: latestVersion + 1,
                  schema: schema as Prisma.InputJsonValue,
                  status: "DRAFT",
                },
              });
              await recordServiceCatalogChange(transaction as PrismaService, {
                entityType: serviceFormsChangeLogEntityType,
                entityId: version.id,
                reason,
                diff: {
                  action: "service_form.version_create",
                  after: {
                    serviceId,
                    version: version.version,
                    formVersionRef: version.id,
                  },
                },
                actorUserId: context.actorUserId,
              });
              return version;
            },
          ),
        { isolationLevel: "ReadCommitted" },
      );
      return toFormVersionResponse(created, 0);
    } catch (error) {
      if (!isFormVersionUniqueConflict(error)) throw error;
      if (attempt === maximumVersionAllocationAttempts - 1) {
        throw new ServiceFormsError("FORM_VERSION_CREATE_CONFLICT");
      }
    }
  }

  throw new ServiceFormsError("FORM_VERSION_CREATE_CONFLICT");
}
