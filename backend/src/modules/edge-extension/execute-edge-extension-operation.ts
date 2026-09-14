import { mapEdgeExtensionError } from './map-edge-extension-error';

export async function executeEdgeExtensionOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapEdgeExtensionError(error);
  }
}
