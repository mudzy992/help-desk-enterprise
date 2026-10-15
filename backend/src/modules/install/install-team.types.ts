import type { InstallTeamRoleKey } from './install-team.constants';

/** F2: one row of the team step. */
export type InstallTeamMemberInput = {
  readonly displayName: string;
  readonly email: string;
  readonly roleKey: InstallTeamRoleKey;
};

export type InstallTeamInput = {
  readonly members: readonly InstallTeamMemberInput[];
};

export type InstallTeamMemberRecord = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly roleKey: string | null;
  /** True for the account the wizard created in the SuperAdmin step. */
  readonly isSuperAdmin: boolean;
};

export type InstallTeamPublicRecord = {
  readonly members: readonly InstallTeamMemberRecord[];
  readonly groupName: string | null;
  readonly maxMembers: number;
  /** At least one other person is in the handler group. */
  readonly isTeamInvited: boolean;
};

export type InstallTeamStatus = {
  readonly team: InstallTeamPublicRecord;
};

/**
 * F2 + owner decision 2: without SMTP the temporary password is shown once in
 * the UI, exactly like the existing user-create flow reports it.
 */
export type CreatedInstallTeamMember = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roleKey: InstallTeamRoleKey;
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: 'ui' | 'email';
};

export type InstallTeamResult = InstallTeamPublicRecord & {
  readonly created: readonly CreatedInstallTeamMember[];
};
