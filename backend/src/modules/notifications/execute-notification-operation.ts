import { mapNotificationError } from './map-notification-error';

export async function executeNotificationOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapNotificationError(error);
  }
}
