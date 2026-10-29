import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { GroupsError } from '../groups/groups.error';
import { UsersError } from '../users/users.error';
import { installTeamErrorCodes } from './install-team.constants';
import { InstallTeamError } from './install-team.error';

const messages: Record<string, string> = {
  [installTeamErrorCodes.invalidInput]:
    'Every team member needs a name, a valid e-mail address and the AGENT or ADMIN role',
  [installTeamErrorCodes.tooManyMembers]: 'Too many team members in one request',
  [installTeamErrorCodes.emailConflict]: 'A user with this e-mail address already exists',
  [installTeamErrorCodes.groupMissing]:
    'The handler group does not exist yet: run the structure step first',
  [installTeamErrorCodes.superAdminRequired]: 'Initial SuperAdmin must exist before inviting the team',
};

/** F2: the team step answers 400 for bad rows and 409 for a taken address. */
export function mapInstallTeamError(error: unknown): HttpException {
  if (error instanceof UsersError) {
    if (error.code === 'EMAIL_CONFLICT') {
      return conflict(installTeamErrorCodes.emailConflict);
    }
    return new BadRequestException({
      code: installTeamErrorCodes.invalidInput,
      message: messages[installTeamErrorCodes.invalidInput],
    });
  }
  if (error instanceof GroupsError) {
    return conflict(installTeamErrorCodes.groupMissing);
  }
  if (!(error instanceof InstallTeamError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] ?? 'The team could not be saved' };
  if (
    error.code === installTeamErrorCodes.emailConflict ||
    error.code === installTeamErrorCodes.groupMissing
  ) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}

function conflict(code: string): HttpException {
  return new ConflictException({ code, message: messages[code] });
}
