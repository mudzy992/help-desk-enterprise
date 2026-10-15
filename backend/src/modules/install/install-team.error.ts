import { installTeamErrorCodes } from './install-team.constants';

export type InstallTeamErrorCode =
  (typeof installTeamErrorCodes)[keyof typeof installTeamErrorCodes];

export class InstallTeamError extends Error {
  constructor(
    readonly code: InstallTeamErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallTeamError';
  }
}
