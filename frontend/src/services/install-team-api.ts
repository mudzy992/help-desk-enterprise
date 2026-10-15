import { apiRequest } from "@/services/api";

/**
 * Install wizard v2 (F2): the team step invites the first colleagues into the
 * handler group the structure step created. The accounts are created by the same
 * server-side flow as the users screen (temporary password included), so without
 * SMTP the wizard must show each password exactly once — it is never returned by
 * a reload.
 */
export type InstallTeamRoleKey = "AGENT" | "ADMIN";

export type InstallTeamMemberInput = {
  readonly displayName: string;
  readonly email: string;
  readonly roleKey: InstallTeamRoleKey;
};

export type InstallTeamMemberRecord = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly roleKey: string | null;
  /** True for the account created in the SuperAdmin step. */
  readonly isSuperAdmin: boolean;
};

export type InstallTeamRecord = {
  readonly members: readonly InstallTeamMemberRecord[];
  readonly groupName: string | null;
  readonly maxMembers: number;
  /** At least one colleague is in the handler group. */
  readonly isTeamInvited: boolean;
};

export type InstallTeamStatus = {
  readonly team: InstallTeamRecord;
};

export type CreatedInstallTeamMember = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly roleKey: InstallTeamRoleKey;
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: "ui" | "email";
};

export type InstallTeamSaveResult = InstallTeamRecord & {
  readonly created: readonly CreatedInstallTeamMember[];
};

export function loadInstallTeam(): Promise<InstallTeamStatus> {
  return apiRequest<InstallTeamStatus>("/install/team");
}

export function saveInstallTeam(
  members: readonly InstallTeamMemberInput[],
): Promise<InstallTeamSaveResult> {
  return apiRequest<InstallTeamSaveResult>("/install/team", {
    method: "POST",
    body: JSON.stringify({ members }),
  });
}
