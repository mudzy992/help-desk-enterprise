import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import {
  normalizeCloseCodeKey,
  normalizeResolutionNote,
} from './normalize-close-code-input';
import { resolveCloseCodeRecord } from './resolve-close-code-record';
import type { TicketCloseCodesConfiguration } from './close-codes.types';
import { collectMissingRequiredFields } from '../required-fields/collect-missing-required-fields';
import { readFormSchemaFields } from '../required-fields/read-form-schema-fields';
import type { TicketRequiredFieldsConfiguration } from '../required-fields/required-fields.types';

export async function applyTicketResolution(input: {
  readonly prisma: PrismaService;
  readonly current: TicketRecord;
  readonly nextStatus: TicketRecord['status'];
  readonly closeCode?: string;
  readonly resolutionNote?: string;
  readonly formData: unknown;
  readonly closeCodes: TicketCloseCodesConfiguration;
  readonly requiredFields: TicketRequiredFieldsConfiguration;
}): Promise<{
  readonly closeCodeId: string | null;
  readonly resolutionNote: string | null;
}> {
  const requestedKey = normalizeCloseCodeKey(input.closeCode);
  const nextNote =
    input.resolutionNote === undefined
      ? input.current.resolutionNote
      : normalizeResolutionNote(input.resolutionNote);
  const currentKey = await loadCloseCodeKey(input.prisma, input.current.closeCodeId);
  const nextKey = requestedKey ?? currentKey;
  const schemaFields = await loadTicketSchemaFields(
    input.prisma,
    input.current.formVersionId,
  );
  const missing = collectMissingRequiredFields({
    currentStatus: input.current.status,
    nextStatus: input.nextStatus,
    closeCodeKey: nextKey,
    resolutionNote: nextNote,
    formData: input.formData,
    schemaFields,
    serviceId: input.current.serviceId,
    closeCodes: input.closeCodes,
    requiredFields: input.requiredFields,
  });
  if (missing.length > 0) {
    throw new TicketsError('REQUIRED_FIELDS_MISSING', 'REQUIRED_FIELDS_MISSING', {
      fields: missing,
    });
  }
  if (!input.closeCodes.enabled || nextKey === null) {
    return {
      closeCodeId: input.current.closeCodeId,
      resolutionNote: nextNote,
    };
  }
  const record = await resolveCloseCodeRecord(
    input.prisma,
    nextKey,
    input.closeCodes,
    input.current.serviceId,
  );
  return {
    closeCodeId: record.id,
    resolutionNote: nextNote,
  };
}

async function loadCloseCodeKey(
  prisma: PrismaService,
  closeCodeId: string | null,
): Promise<string | null> {
  if (closeCodeId === null) {
    return null;
  }
  const record = await prisma.closeCode.findUnique({
    where: { id: closeCodeId },
    select: { key: true },
  });
  return record?.key ?? null;
}

async function loadTicketSchemaFields(
  prisma: PrismaService,
  formVersionId: string,
) {
  const version = await prisma.formVersion.findUnique({
    where: { id: formVersionId },
    select: { schema: true },
  });
  return readFormSchemaFields(version?.schema);
}
