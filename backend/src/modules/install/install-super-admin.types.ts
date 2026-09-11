export type CreateInstallSuperAdminInput = {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
};

export type InstallSuperAdminPublicRecord = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: true;
};

export type InstallSuperAdminStatus = {
  readonly superAdmin: InstallSuperAdminPublicRecord | null;
};

export type InstallSuperAdminPersistence = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isLocalOnly: boolean;
  readonly entraObjectId: string | null;
};

export type HashInstallSuperAdminPassword = (
  password: string,
) => Promise<string>;
