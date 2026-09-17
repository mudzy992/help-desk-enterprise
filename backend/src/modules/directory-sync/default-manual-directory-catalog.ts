import type {
  DirectoryGroup,
  DirectoryOrganizationalUnit,
  DirectoryUser,
} from './directory-sync.types';

export const defaultManualDirectoryCatalog: {
  readonly users: readonly DirectoryUser[];
  readonly groups: readonly DirectoryGroup[];
  readonly organizationalUnits: readonly (DirectoryOrganizationalUnit & {
    readonly parentExternalId: string | null;
  })[];
} = {
  organizationalUnits: [
    {
      externalId: 'manual_only:ou:users',
      displayName: 'Users',
      distinguishedName: 'OU=Users,DC=example,DC=com',
      organizationalUnitPath: '/Users',
      parentExternalId: null,
      type: 'DIRECTORATE',
    },
    {
      externalId: 'manual_only:ou:users-it',
      displayName: 'IT',
      distinguishedName: 'OU=IT,OU=Users,DC=example,DC=com',
      organizationalUnitPath: '/Users/IT',
      parentExternalId: 'manual_only:ou:users',
      type: 'BRANCH',
    },
    {
      externalId: 'manual_only:ou:groups',
      displayName: 'Groups',
      distinguishedName: 'OU=Groups,DC=example,DC=com',
      organizationalUnitPath: '/Groups',
      parentExternalId: null,
      type: 'DIRECTORATE',
    },
  ],
  users: [
    {
      externalId: 'manual_only:user:dev-reader',
      login: 'dev.reader',
      email: 'dev.reader@example.com',
      displayName: 'Dev Reader',
      distinguishedName: 'CN=Dev Reader,OU=Users,DC=example,DC=com',
      organizationalUnitPath: '/Users',
    },
    {
      externalId: 'manual_only:user:it-reader',
      login: 'it.reader',
      email: 'it.reader@example.com',
      displayName: 'IT Reader',
      distinguishedName: 'CN=IT Reader,OU=IT,OU=Users,DC=example,DC=com',
      organizationalUnitPath: '/Users/IT',
    },
  ],
  groups: [
    {
      externalId: 'manual_only:group:helpdesk',
      displayName: 'HelpDesk',
      distinguishedName: 'CN=HelpDesk,OU=Groups,DC=example,DC=com',
      organizationalUnitPath: '/Groups',
    },
  ],
};
