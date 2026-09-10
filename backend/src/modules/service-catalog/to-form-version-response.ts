import { parseFormSchema } from './parse-form-schema';
import { isFormVersionImmutable } from './is-form-version-immutable';
import type { FormVersionRecord, FormVersionResponse } from './service-forms.types';

export function toFormVersionResponse(
  record: FormVersionRecord,
  ticketCount: number,
): FormVersionResponse {
  return {
    formVersionRef: record.id,
    serviceId: record.serviceId,
    version: record.version,
    status: record.status,
    schema: parseFormSchema(record.schema),
    isImmutable: isFormVersionImmutable(record, ticketCount),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
