import { validateInstallSmtp } from './validate-install-smtp';

const completeOn = {
  enabled: true as const,
  host: 'smtp.example.com',
  port: 587,
  tls: true,
  username: 'helpdesk',
  password: 'smtp-secret-value',
  fromAddress: 'noreply@example.com',
};

const emptyStored = {
  enabled: false,
  host: '',
  port: 587,
  tls: true,
  username: '',
  password: undefined,
  fromAddress: '',
  emailAddonEnabled: false,
};

describe('validateInstallSmtp', () => {
  it('accepts SMTP off without configuration fields', () => {
    expect(validateInstallSmtp({ enabled: false }, emptyStored)).toEqual({
      enabled: false,
    });
    expect(
      validateInstallSmtp(
        { enabled: false, host: '', password: 'ignored' },
        emptyStored,
      ),
    ).toEqual({ enabled: false });
  });

  it('accepts a complete SMTP on configuration', () => {
    expect(validateInstallSmtp(completeOn, emptyStored)).toEqual({
      enabled: true,
      persistPassword: true,
      configuration: {
        host: 'smtp.example.com',
        port: 587,
        tls: true,
        username: 'helpdesk',
        password: 'smtp-secret-value',
        fromAddress: 'noreply@example.com',
      },
    });
  });

  it('requires host, username, password, and from address when SMTP is on', () => {
    expect(() =>
      validateInstallSmtp({ enabled: true }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp({ ...completeOn, host: undefined }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp({ ...completeOn, username: ' ' }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp({ ...completeOn, password: undefined }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp(
        { ...completeOn, fromAddress: undefined },
        emptyStored,
      ),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
  });

  it('rejects invalid host, port, or from address', () => {
    expect(() =>
      validateInstallSmtp({ ...completeOn, host: 'smtp://mail' }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp({ ...completeOn, port: 0 }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp({ ...completeOn, port: 70000 }, emptyStored),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
    expect(() =>
      validateInstallSmtp(
        { ...completeOn, fromAddress: 'not-an-email' },
        emptyStored,
      ),
    ).toThrow(/INVALID_SMTP_CONFIGURATION/);
  });

  it('reuses a stored password when SMTP stays on', () => {
    expect(
      validateInstallSmtp(
        {
          enabled: true,
          host: 'smtp.example.com',
          username: 'helpdesk',
          fromAddress: 'noreply@example.com',
        },
        { ...emptyStored, password: 'smtp-secret-value' },
      ),
    ).toMatchObject({
      enabled: true,
      persistPassword: false,
      configuration: { password: 'smtp-secret-value', port: 587, tls: true },
    });
  });

  it('prefills omitted ON fields from env without exposing a parallel config path', () => {
    expect(
      validateInstallSmtp({ enabled: true }, emptyStored, {
        host: 'smtp.example.com',
        username: 'helpdesk',
        password: 'smtp-secret-value',
        fromAddress: 'noreply@example.com',
      }),
    ).toMatchObject({
      enabled: true,
      persistPassword: false,
      configuration: {
        host: 'smtp.example.com',
        password: 'smtp-secret-value',
        fromAddress: 'noreply@example.com',
      },
    });
  });
});
