import { mapSlaError } from './map-sla-error';

export async function executeSlaOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapSlaError(error);
  }
}
