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
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitName: string | null;
  /** Optional modules that are switched on (menus follow them; APIs still check). */
  readonly modules: { readonly cmdb: boolean };
};
