import { installTeamErrorCodes, installTeamLimits, installTeamRoleKeys } from './install-team.constants';
import { InstallTeamError } from './install-team.error';
import type { InstallTeamInput, InstallTeamMemberInput } from './install-team.types';

/**
 * Install wizard v2 (F2): the step validates every row before the first account
 * is created — a half-created team would leave the operator without the
 * passwords they were shown. Duplicate addresses inside one request are refused
 * here; an address that already exists in the installation is a 409 from the
 * users domain.
 */
export function validateInstallTeam(input: InstallTeamInput): InstallTeamInput {
  if (input.members.length === 0 || input.members.length > installTeamLimits.maxMembers) {
    throw new InstallTeamError(installTeamErrorCodes.invalidInput);
  }
  const members = input.members.map((member) => normalizeMember(member));
  const emails = new Set(members.map((member) => member.email));
  if (emails.size !== members.length) {
    throw new InstallTeamError(installTeamErrorCodes.invalidInput);
  }
  return { members };
}

function normalizeMember(member: InstallTeamMemberInput): InstallTeamMemberInput {
  const displayName = member.displayName.trim().replace(/\s+/g, ' ');
  const email = member.email.trim().toLowerCase();
  if (
    displayName.length === 0 ||
    displayName.length > installTeamLimits.maxDisplayNameLength ||
    email.length === 0 ||
    email.length > installTeamLimits.maxEmailLength ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !(installTeamRoleKeys as readonly string[]).includes(member.roleKey)
  ) {
    throw new InstallTeamError(installTeamErrorCodes.invalidInput);
  }
  return { displayName, email, roleKey: member.roleKey };
}
