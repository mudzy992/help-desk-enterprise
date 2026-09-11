import { parseFormSchema } from '../../service-catalog/parse-form-schema';
import type { ServiceFormField } from '../../service-catalog/form-schema.types';

export function readFormSchemaFields(schema: unknown): readonly ServiceFormField[] {
  try {
    return parseFormSchema(schema).fields;
  } catch {
    return [];
  }
}
