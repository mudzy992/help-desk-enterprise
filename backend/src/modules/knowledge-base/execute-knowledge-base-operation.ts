import { mapKnowledgeBaseError } from './map-knowledge-base-error';

export async function executeKnowledgeBaseOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapKnowledgeBaseError(error);
  }
}
