import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
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
    case changeErrorCodes.conflictsStale:
    case changeErrorCodes.noApprovers:
    case changeErrorCodes.cabGroupTooLarge:
    case changeErrorCodes.alreadyVoted:
    case changeErrorCodes.notInAuthorization:
    case changeErrorCodes.problemClosed:
      return new ConflictException(body);
    // W7.71: a template edit is a conditional write. A missing revision is 428,
    // a revision somebody else already moved past is 412 - both fail closed, so
    // no manager can overwrite another manager's edit unnoticed.
    case changeErrorCodes.templateRevisionRequired:
      return new HttpException(body, HttpStatus.PRECONDITION_REQUIRED);
    case changeErrorCodes.templateStale:
      return new HttpException(body, HttpStatus.PRECONDITION_FAILED);
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
