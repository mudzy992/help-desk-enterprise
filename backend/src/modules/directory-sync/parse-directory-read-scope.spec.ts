import { DirectorySyncError } from './directory-sync.error';
import { parseDirectoryReadOperation } from './parse-directory-read-operation';
import { parseDirectoryReadScope } from './parse-directory-read-scope';

const usersBaseDistinguishedName = 'OU=Users,DC=example,DC=com';
const groupsBaseDistinguishedName = 'OU=Groups,DC=example,DC=com';

describe('parseDirectoryReadScope', () => {
  it('accepts an explicit distinguished name under the operation base', () => {
    const scope = parseDirectoryReadScope({
      operation: parseDirectoryReadOperation('users'),
      scope: {
        distinguishedName: 'OU=Users,DC=example,DC=com',
        includeSubtree: true,
      },
      usersBaseDistinguishedName,
      groupsBaseDistinguishedName,
    });
    expect(scope).toEqual({
      distinguishedName: 'OU=Users,DC=example,DC=com',
      organizationalUnitPath: null,
      includeSubtree: true,
    });
  });

  it('accepts a descendant distinguished name and optional path', () => {
    const scope = parseDirectoryReadScope({
      operation: parseDirectoryReadOperation('users'),
      scope: {
        distinguishedName: 'OU=IT,OU=Users,DC=example,DC=com',
        organizationalUnitPath: '/Users/IT',
        includeSubtree: false,
      },
      usersBaseDistinguishedName,
      groupsBaseDistinguishedName,
    });
    expect(scope.distinguishedName).toBe('OU=IT,OU=Users,DC=example,DC=com');
    expect(scope.organizationalUnitPath).toBe('/Users/IT');
    expect(scope.includeSubtree).toBe(false);
  });

  it('rejects missing scope, missing identity, and missing includeSubtree', () => {
    const operation = parseDirectoryReadOperation('users');
    expect(() =>
      parseDirectoryReadScope({
        operation,
        scope: undefined,
        usersBaseDistinguishedName,
        groupsBaseDistinguishedName,
      }),
    ).toThrow(DirectorySyncError);
    expect(() =>
      parseDirectoryReadScope({
        operation,
        scope: { includeSubtree: true },
        usersBaseDistinguishedName,
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
    expect(() =>
      parseDirectoryReadScope({
        operation,
        scope: { distinguishedName: usersBaseDistinguishedName },
        usersBaseDistinguishedName,
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
  });

  it('rejects unrestricted forest-root distinguished names and root paths', () => {
    const operation = parseDirectoryReadOperation('users');
    expect(() =>
      parseDirectoryReadScope({
        operation,
        scope: {
          distinguishedName: 'DC=example,DC=com',
          includeSubtree: true,
        },
        usersBaseDistinguishedName,
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
    expect(() =>
      parseDirectoryReadScope({
        operation,
        scope: { organizationalUnitPath: '/', includeSubtree: true },
        usersBaseDistinguishedName,
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
  });

  it('rejects distinguished names outside the configured operation base', () => {
    expect(() =>
      parseDirectoryReadScope({
        operation: parseDirectoryReadOperation('users'),
        scope: {
          distinguishedName: 'OU=Groups,DC=example,DC=com',
          includeSubtree: true,
        },
        usersBaseDistinguishedName,
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
  });

  it('rejects empty or forest-root configured base distinguished names', () => {
    expect(() =>
      parseDirectoryReadScope({
        operation: parseDirectoryReadOperation('users'),
        scope: {
          distinguishedName: 'OU=Users,DC=example,DC=com',
          includeSubtree: true,
        },
        usersBaseDistinguishedName: '',
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
    expect(() =>
      parseDirectoryReadScope({
        operation: parseDirectoryReadOperation('users'),
        scope: {
          distinguishedName: 'OU=Users,DC=example,DC=com',
          includeSubtree: true,
        },
        usersBaseDistinguishedName: 'DC=example,DC=com',
        groupsBaseDistinguishedName,
      }),
    ).toThrow(new DirectorySyncError('INVALID_SCOPE'));
  });
});
