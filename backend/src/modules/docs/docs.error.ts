import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { docsErrorCodes, type DocsErrorCode } from './docs.constants';

export class DocsError extends Error {
  constructor(readonly code: DocsErrorCode) {
    super(code);
    this.name = 'DocsError';
  }
}

/** Mapira `DocsError` u HTTP odgovor; nepoznate greške propušta dalje. */
export function mapDocsError(error: unknown): unknown {
  if (!(error instanceof DocsError)) return error;
  const body = { code: error.code, message: error.code };
  switch (error.code) {
    case docsErrorCodes.contentUnavailable:
      return new ServiceUnavailableException(body);
    case docsErrorCodes.pageNotFound:
      return new NotFoundException(body);
    default:
      return new BadRequestException(body);
  }
}

export async function runDocs<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapDocsError(error);
    if (mapped instanceof HttpException) throw mapped;
    throw error;
  }
}
