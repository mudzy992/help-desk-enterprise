import {
  CliInvocationError,
  confirmationPhrase,
  fingerprintTarget,
  formatCliTarget,
  parseDatabaseTarget,
  readCliFlag,
  resolveCliTarget,
} from './cli-target';

const databaseUrl = 'postgresql://operator:sup3r-s3cret@db.internal.example:6543/helpdesk_prod';

describe('CLI target guard (W1.5, BA-xcut-08)', () => {
  it('parses the database out of the URL without keeping the credentials', () => {
    expect(parseDatabaseTarget(databaseUrl)).toEqual({
      host: 'db.internal.example',
      port: '6543',
      database: 'helpdesk_prod',
    });
    expect(parseDatabaseTarget('postgres://u:p@localhost/help_desk')).toEqual({
      host: 'localhost',
      port: '5432',
      database: 'help_desk',
    });
    expect(parseDatabaseTarget('postgresql://u:p@localhost:5432/help%20desk').database).toBe('help desk');
  });

  it('refuses a URL that is not PostgreSQL or has no database', () => {
    expect(() => parseDatabaseTarget('mysql://u:p@localhost/helpdesk')).toThrow(CliInvocationError);
    expect(() => parseDatabaseTarget('not a url')).toThrow(CliInvocationError);
    expect(() => parseDatabaseTarget('postgresql://u:p@localhost/')).toThrow(
      expect.objectContaining({ reason: 'CLI_DATABASE_URL_INCOMPLETE' }),
    );
  });

  it('fingerprints host:port/database only, so the password cannot leak into a log or an audit row', () => {
    const target = parseDatabaseTarget(databaseUrl);
    const fingerprint = fingerprintTarget(target);
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/u);
    expect(fingerprint).toBe(
      fingerprintTarget(parseDatabaseTarget('postgresql://other:other@db.internal.example:6543/helpdesk_prod')),
    );
    expect(fingerprint).not.toBe(fingerprintTarget(parseDatabaseTarget('postgresql://u:p@db.internal.example:6543/other')));
    const printed = formatCliTarget({ ...target, environment: 'production', fingerprint });
    expect(printed).toContain(fingerprint);
    expect(printed).not.toContain('sup3r-s3cret');
    expect(printed).not.toContain('operator');
  });

  it('refuses to guess the environment, even for a read', () => {
    expect(() => resolveCliTarget({ argv: [], env: {}, databaseUrl })).toThrow(
      expect.objectContaining({ reason: 'CLI_ENVIRONMENT_REQUIRED' }),
    );
    expect(() => resolveCliTarget({ argv: ['--environment', 'prod'], env: {}, databaseUrl })).toThrow(
      expect.objectContaining({ reason: 'CLI_ENVIRONMENT_INVALID:prod' }),
    );
  });

  it('accepts the environment from the flag or CLI_ENVIRONMENT and keeps the fingerprint', () => {
    const fromFlag = resolveCliTarget({ argv: ['--environment', 'staging'], env: {}, databaseUrl });
    const fromEnv = resolveCliTarget({ argv: [], env: { CLI_ENVIRONMENT: ' staging ' }, databaseUrl });
    expect(fromFlag).toEqual(fromEnv);
    expect(fromFlag).toMatchObject({ environment: 'staging', host: 'db.internal.example', database: 'helpdesk_prod' });
  });

  it('refuses a production container that claims to be development or staging', () => {
    expect(() =>
      resolveCliTarget({ argv: ['--environment', 'development'], env: { NODE_ENV: 'production' }, databaseUrl }),
    ).toThrow(expect.objectContaining({ reason: 'CLI_ENVIRONMENT_MISMATCH:development:NODE_ENV=production' }));
    expect(
      resolveCliTarget({ argv: ['--environment', 'production'], env: { NODE_ENV: 'production' }, databaseUrl }).environment,
    ).toBe('production');
  });

  it('requires DATABASE_URL', () => {
    expect(() => resolveCliTarget({ argv: ['--environment', 'development'], env: {}, databaseUrl: undefined })).toThrow(
      expect.objectContaining({ reason: 'CLI_DATABASE_URL_REQUIRED' }),
    );
  });

  it('builds a confirmation phrase that names command, environment and database', () => {
    const target = resolveCliTarget({ argv: ['--environment', 'production'], env: {}, databaseUrl });
    expect(confirmationPhrase({ command: 'assets-seed-demo', target })).toBe(
      `assets-seed-demo@production:${target.fingerprint}`,
    );
  });

  it('tells an absent flag from a flag without a value', () => {
    expect(readCliFlag(['--apply'], 'reason')).toBeNull();
    expect(readCliFlag(['--reason', '--apply'], 'reason')).toBe('');
    expect(readCliFlag(['--reason', '  jer treba  '], 'reason')).toBe('jer treba');
  });
});
