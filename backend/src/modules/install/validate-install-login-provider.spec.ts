import { validateInstallLoginProvider } from './validate-install-login-provider';

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const emptyStored = {
  azureTenantId: undefined,
  azureClientId: undefined,
  adLdapsUrlsCsv: undefined,
  adBindDn: undefined,
  adBindPassword: undefined,
};

describe('validateInstallLoginProvider', () => {
  it('accepts local without AD or Entra fields', () => {
    expect(validateInstallLoginProvider({ mode: 'local' }, emptyStored)).toEqual(
      { mode: 'local' },
    );
  });

  it('requires tenant and client together for entra_ad', () => {
    expect(
      validateInstallLoginProvider(
        { mode: 'entra_ad', azureTenantId: tenantId, azureClientId: clientId },
        emptyStored,
      ),
    ).toEqual({
      mode: 'entra_ad',
      entra: { tenantId, clientId },
      directoryBind: null,
    });
  });

  it('requires a complete LDAPS bind when tenant and client are omitted', () => {
    expect(
      validateInstallLoginProvider(
        {
          mode: 'entra_ad',
          adLdapsUrlsCsv: 'ldaps://dc1.epbih.ba:636',
          adBindDn: 'CN=svc,DC=epbih,DC=ba',
          adBindPassword: 'secret',
        },
        emptyStored,
      ),
    ).toMatchObject({
      mode: 'entra_ad',
      entra: null,
      directoryBind: {
        urlsCsv: 'ldaps://dc1.epbih.ba:636',
        bindDn: 'CN=svc,DC=epbih,DC=ba',
      },
    });
  });

  it('rejects incomplete or invalid entra_ad configuration', () => {
    expect(() =>
      validateInstallLoginProvider({ mode: 'entra_ad' }, emptyStored),
    ).toThrow(/INVALID_LOGIN_PROVIDER_CONFIGURATION/);
    expect(() =>
      validateInstallLoginProvider(
        { mode: 'entra_ad', azureTenantId: tenantId },
        emptyStored,
      ),
    ).toThrow(/INVALID_LOGIN_PROVIDER_CONFIGURATION/);
    expect(() =>
      validateInstallLoginProvider(
        {
          mode: 'entra_ad',
          azureTenantId: 'not-a-guid',
          azureClientId: clientId,
        },
        emptyStored,
      ),
    ).toThrow(/INVALID_LOGIN_PROVIDER_CONFIGURATION/);
    expect(() =>
      validateInstallLoginProvider(
        {
          mode: 'entra_ad',
          adLdapsUrlsCsv: 'ldaps://dc1.epbih.ba:636',
          adBindDn: 'CN=svc,DC=epbih,DC=ba',
        },
        emptyStored,
      ),
    ).toThrow(/INVALID_LOGIN_PROVIDER_CONFIGURATION/);
  });

  it('allows entra_ad when a complete configuration is already stored', () => {
    expect(
      validateInstallLoginProvider(
        { mode: 'entra_ad' },
        {
          ...emptyStored,
          azureTenantId: tenantId,
          azureClientId: clientId,
        },
      ),
    ).toEqual({ mode: 'entra_ad', entra: null, directoryBind: null });
  });
});
