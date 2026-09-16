export type ManualDirectoryOrganizationalUnitResponse = {
  readonly id: string;
  readonly externalId: string;
  readonly displayName: string;
  readonly distinguishedName: string;
  readonly organizationalUnitPath: string;
  readonly parentExternalId: string | null;
};

export type CreateManualDirectoryOrganizationalUnitInput = {
  readonly displayName: string;
  readonly parentExternalId?: string | null;
  readonly distinguishedName?: string | null;
};

export type UpdateManualDirectoryOrganizationalUnitInput = {
  readonly displayName?: string;
  readonly parentExternalId?: string | null;
  readonly distinguishedName?: string | null;
};
