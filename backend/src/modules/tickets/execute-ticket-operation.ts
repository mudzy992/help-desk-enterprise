import { mapTicketError } from './map-ticket-error';
import { mapServiceFormsError } from '../service-catalog/map-service-forms-error';
import { ServiceFormsError } from '../service-catalog/service-forms.error';

export async function executeTicketOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ServiceFormsError) {
      throw mapServiceFormsError(error);
    }
    throw mapTicketError(error);
  }
}
