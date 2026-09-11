import { mapTicketError } from './map-ticket-error';

export async function executeTicketOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapTicketError(error);
  }
}
