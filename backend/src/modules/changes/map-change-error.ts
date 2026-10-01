import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { ChangeError, changeErrorCodes } from './changes.constants';

/** Paket 3.4: domain errors -> HTTP. "Module off" is 404, as if it did not exist. */
export function mapChangeError(error: unknown): unknown {
  if (!(error instanceof ChangeError)) return error;
  const body = { code: error.code, message: error.detail ?? error.code, detail: error.detail ?? null };
  switch (error.code) {
    case changeErrorCodes.disabled:
    case changeErrorCodes.notFound:
    case changeErrorCodes.unitNotFound:
    case changeErrorCodes.userNotFound:
    case changeErrorCodes.groupNotFound:
    case changeErrorCodes.serviceNotFound:
    case changeErrorCodes.assetNotFound:
    case changeErrorCodes.problemNotFound:
    case changeErrorCodes.templateNotFound:
      return new NotFoundException(body);
    case changeErrorCodes.forbidden:
    case changeErrorCodes.outOfScope:
    case changeErrorCodes.notApprover:
      return new ForbiddenException(body);
    case changeErrorCodes.transition:
    case changeErrorCodes.requirementMissing:
    case changeErrorCodes.finalStatus:
    case changeErrorCodes.locked:
    case changeErrorCodes.versionConflict:
    case changeErrorCodes.leadTime:
    case changeErrorCodes.freeze:
    case changeErrorCodes.conflictsNotAcknowledged:
    case changeErrorCodes.noApprovers:
    case changeErrorCodes.alreadyVoted:
    case changeErrorCodes.notInAuthorization:
      return new ConflictException(body);
    default:
      return new BadRequestException(body);
  }
}

export async function runChange<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapChangeError(error);
    if (mapped instanceof HttpException) throw mapped;
    throw error;
  }
}
