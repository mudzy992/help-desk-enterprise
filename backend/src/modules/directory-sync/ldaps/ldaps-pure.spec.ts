import { classifyOrganizationalUnit } from './classify-organizational-unit';
import { cronFiredBetween, cronMatches, parseCronField } from './cron-schedule';
import {
  isDistinguishedNameWithin,
  organizationalUnitPathFromDistinguishedName,
  parentDistinguishedName,
  parseDistinguishedName,
} from './distinguished-name';
import { escapeLdapFilterValue } from './escape-ldap-filter-value';
import { formatObjectGuid } from './format-object-guid';
import { classifyLdapError, connectWithFailover, LdapConnectionError } from './ldap-directory-client';
import { mapLdapsUserEntry } from './map-ldaps-entries';
import {
  parseOrganizationalUnitMappingOverrides,
  resolveUserOrganizationalUnit,
} from './resolve-user-organizational-unit';

const base = 'OU=Korisnici,DC=epbih,DC=ba';

describe('LDAPS helpers (paket 1.8)', () => {
  it('escapes filter values per RFC 4515', () => {
    expect(escapeLdapFilterValue('a*b(c)\\d\u0000')).toBe('a\\2ab\\28c\\29\\5cd\\00');
    expect(escapeLdapFilterValue('ana.anic@epbih.ba')).toBe('ana.anic@epbih.ba');
  });

  it('formats objectGUID like Get-ADUser (mixed endianness)', () => {
    const bytes = Buffer.from('78563412bc9af0de0123456789abcdef', 'hex');
    expect(formatObjectGuid(bytes)).toBe('12345678-9abc-def0-0123-456789abcdef');
    expect(formatObjectGuid(Buffer.alloc(3))).toBeNull();
    expect(formatObjectGuid(undefined)).toBeNull();
  });

  it('parses DNs with escaped commas and builds the application OU path', () => {
    const dn = 'CN=Anić\\, Ana,OU=Visoko,OU=ED Sarajevo,OU=Korisnici,DC=epbih,DC=ba';
    expect(parseDistinguishedName(dn)[0]).toEqual({ type: 'CN', value: 'Anić, Ana' });
    expect(organizationalUnitPathFromDistinguishedName(dn)).toBe('/Korisnici/ED Sarajevo/Visoko');
    expect(parentDistinguishedName(dn)).toBe('OU=Visoko,OU=ED Sarajevo,OU=Korisnici,DC=epbih,DC=ba');
    expect(isDistinguishedNameWithin(dn, 'ou=korisnici, dc=EPBIH, dc=ba')).toBe(true);
    expect(isDistinguishedNameWithin('CN=x,OU=Grupe,DC=epbih,DC=ba', base)).toBe(false);
    expect(organizationalUnitPathFromDistinguishedName('DC=epbih,DC=ba')).toBeNull();
  });

  it('classifies units per RAW §17–20', () => {
    const at = (path: string) => classifyOrganizationalUnit({ path, rootPath: '/Korisnici' });
    expect(at('/Korisnici')).toBe('DIRECTORATE');
    expect(at('/Korisnici/Direkcija')).toBe('DIRECTORATE');
    expect(at('/Korisnici/Direkcija/Služba IT')).toBe('SERVICE');
    expect(at('/Korisnici/ED Zenica')).toBe('BRANCH');
    expect(at('/Korisnici/ED Zenica/Breza')).toBe('OFFICE');
    expect(at('/Korisnici/ED Zenica/Breza/Tim')).toBe('SECTOR');
  });

  it('maps a user entry and detects disabled accounts', () => {
    const user = mapLdapsUserEntry({
      distinguishedName: 'CN=Ana,OU=Visoko,OU=Korisnici,DC=epbih,DC=ba',
      mail: 'Ana.Anic@EPBIH.ba',
      givenName: 'Ana',
      sn: 'Anić',
      userAccountControl: '514',
      memberOf: ['CN=G1,OU=Grupe,DC=epbih,DC=ba'],
      objectGUID: Buffer.alloc(16, 1),
    });
    expect(user).toMatchObject({
      email: 'ana.anic@epbih.ba',
      displayName: 'Ana Anić',
      disabled: true,
      memberOf: ['CN=G1,OU=Grupe,DC=epbih,DC=ba'],
    });
    expect(user?.guid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves the OU: override > strategy > DN path; company/department falls back to DN', () => {
    const units = new Map([
      ['/Korisnici/ED Zenica', { path: '/Korisnici/ED Zenica', company: null, department: null }],
      ['/Korisnici/ED Zenica/Breza', { path: '/Korisnici/ED Zenica/Breza', company: 'EPBiH', department: 'Breza' }],
      ['/Korisnici/Direkcija', { path: '/Korisnici/Direkcija', company: null, department: null }],
    ]);
    const user = {
      guid: 'g', email: 'a@x', userPrincipalName: null, samAccountName: null, displayName: 'A',
      memberOf: [], disabled: false,
      distinguishedName: 'CN=A,OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba',
      company: 'EPBiH', department: 'Breza',
    };
    expect(resolveUserOrganizationalUnit({ user, strategy: 'by_dn_ou_path', overrides: [], knownUnits: units }))
      .toEqual({ path: '/Korisnici/ED Zenica', via: 'dn_path' });
    expect(resolveUserOrganizationalUnit({ user, strategy: 'by_company_department', overrides: [], knownUnits: units }))
      .toEqual({ path: '/Korisnici/ED Zenica/Breza', via: 'company_department' });
    expect(
      resolveUserOrganizationalUnit({
        user,
        strategy: 'by_company_department',
        overrides: [{ dnSuffix: 'OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba', ouPath: '/Korisnici/Direkcija' }],
        knownUnits: units,
      }),
    ).toEqual({ path: '/Korisnici/Direkcija', via: 'override' });
    expect(
      resolveUserOrganizationalUnit({
        user: { ...user, distinguishedName: 'CN=A,OU=Nepoznata,OU=Korisnici,DC=epbih,DC=ba', company: null },
        strategy: 'by_company_department',
        overrides: [],
        knownUnits: units,
      }),
    ).toEqual({ path: null, via: 'none' });
  });

  it('parses overrides tolerantly', () => {
    expect(parseOrganizationalUnitMappingOverrides('not json')).toEqual([]);
    expect(
      parseOrganizationalUnitMappingOverrides(
        JSON.stringify([
          { dnSuffix: 'OU=X,DC=a', ouPath: '/Korisnici/X' },
          { company: 'EPBiH', department: 'IT', ouPath: '/Korisnici/Direkcija/IT' },
          { company: 'EPBiH', ouPath: 'bez-kose-crte' },
          42,
        ]),
      ),
    ).toEqual([
      { dnSuffix: 'OU=X,DC=a', ouPath: '/Korisnici/X' },
      { company: 'EPBiH', department: 'IT', ouPath: '/Korisnici/Direkcija/IT' },
    ]);
  });

  it('fails over to the next domain controller and reports secret-free codes', async () => {
    const client = { search: jest.fn(), close: jest.fn() };
    const factory = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce(client);
    const settings = {
      urls: ['ldaps://dc1:636', 'ldaps://dc2:636'], bindDn: 'x', bindPassword: 'secret',
      caCertificatePem: null, connectTimeoutMilliseconds: 1, operationTimeoutMilliseconds: 1,
    };
    const connected = await connectWithFailover(settings, factory);
    expect(connected.url).toBe('ldaps://dc2:636');
    expect(connected.attempts).toEqual([{ url: 'ldaps://dc1:636', errorCode: 'NETWORK' }]);

    const failing = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))
      .mockRejectedValueOnce(Object.assign(new Error('Invalid Credentials'), { name: 'InvalidCredentialsError' }));
    const error = await connectWithFailover(settings, failing).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LdapConnectionError);
    expect((error as LdapConnectionError).errorCode).toBe('INVALID_BIND_CREDENTIALS');
    expect(JSON.stringify((error as LdapConnectionError).attempts)).not.toContain('secret');
  });

  it('classifies TLS and timeout errors', () => {
    expect(classifyLdapError(new Error('unable to verify the first certificate'))).toBe('TLS_CERTIFICATE');
    expect(classifyLdapError(new Error('Connection timeout after 10000ms'))).toBe('TIMEOUT');
    expect(classifyLdapError({ name: 'NoSuchObjectError' })).toBe('BASE_DN_NOT_FOUND');
  });

  it('matches cron expressions in Europe/Sarajevo, including DST', () => {
    expect([...(parseCronField('*/15', 0) ?? [])]).toEqual([0, 15, 30, 45]);
    expect(parseCronField('70', 0)).toBeNull();
    // 02:30 local in summer = 00:30 UTC; in winter = 01:30 UTC.
    expect(cronMatches('30 2 * * *', new Date('2026-07-01T00:30:00Z'), 'Europe/Sarajevo')).toBe(true);
    expect(cronMatches('30 2 * * *', new Date('2026-12-01T01:30:00Z'), 'Europe/Sarajevo')).toBe(true);
    expect(cronMatches('30 2 * * 1-5', new Date('2026-12-05T01:30:00Z'), 'Europe/Sarajevo')).toBe(false);
    expect(
      cronFiredBetween('30 2 * * *', new Date('2026-12-01T01:20:00Z'), new Date('2026-12-01T01:35:00Z'), 'Europe/Sarajevo'),
    ).toBe(true);
    expect(
      cronFiredBetween('30 2 * * *', new Date('2026-12-01T01:30:00Z'), new Date('2026-12-01T01:45:00Z'), 'Europe/Sarajevo'),
    ).toBe(false);
  });
});
