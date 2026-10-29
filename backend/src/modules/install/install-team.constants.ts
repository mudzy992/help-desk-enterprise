/**
 * Install wizard v2 (F2): the team step invites people into the handler group
 * created by the structure step. Roles are limited to the two the founder can
 * hand out before anybody signed in; the cap keeps a single request from
 * turning into an unbounded user-creation job.
 */
export const installTeamRoleKeys = ['AGENT', 'ADMIN'] as const;

export type InstallTeamRoleKey = (typeof installTeamRoleKeys)[number];

export const installTeamLimits = {
  maxMembers: 25,
  maxDisplayNameLength: 120,
  maxEmailLength: 254,
} as const;

export const installTeamErrorCodes = {
  invalidInput: 'INSTALL_TEAM_INVALID',
  tooManyMembers: 'INSTALL_TEAM_LIMIT_EXCEEDED',
  emailConflict: 'INSTALL_TEAM_EMAIL_CONFLICT',
  groupMissing: 'INSTALL_TEAM_STRUCTURE_REQUIRED',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
} as const;

export const installTeamChangeReason = 'install_team';
