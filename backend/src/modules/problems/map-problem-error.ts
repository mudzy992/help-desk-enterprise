import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { ProblemError, problemErrorCodes } from './problems.constants';

/** Paket 3.3: domain errors -> HTTP. "Module off" is 404, as if it did not exist. */
export function mapProblemError(error: unknown): unknown {
  if (!(error instanceof ProblemError)) return error;
  const body = { code: error.code, message: error.detail ?? error.code, detail: error.detail ?? null };
  switch (error.code) {
    case problemErrorCodes.disabled:
    case problemErrorCodes.notFound:
    case problemErrorCodes.unitNotFound:
    case problemErrorCodes.userNotFound:
    case problemErrorCodes.groupNotFound:
    case problemErrorCodes.serviceNotFound:
    case problemErrorCodes.ticketNotFound:
    case problemErrorCodes.ticketNotLinked:
    case problemErrorCodes.assetNotFound:
    case problemErrorCodes.incidentNotFound:
      return new NotFoundException(body);
    case problemErrorCodes.forbidden:
    case problemErrorCodes.outOfScope:
      return new ForbiddenException(body);
    case problemErrorCodes.statusTransition:
    case problemErrorCodes.requirementMissing:
    case problemErrorCodes.finalStatus:
    case problemErrorCodes.versionConflict:
    case problemErrorCodes.ticketInOtherProblem:
    case problemErrorCodes.problemNotOpen:
    case problemErrorCodes.articleExists:
      return new ConflictException(body);
    default:
      return new BadRequestException(body);
  }
}

export async function runProblem<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapProblemError(error);
    if (mapped instanceof HttpException) throw mapped;
    throw error;
  }
}
