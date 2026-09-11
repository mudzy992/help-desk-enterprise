export type CurrentSessionResponse = {
  readonly principal: {
    readonly subjectId: string;
    readonly email: string;
    readonly displayName: string;
    readonly isLocalOnly: boolean;
  };
  readonly isSuperAdmin: boolean;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
};
