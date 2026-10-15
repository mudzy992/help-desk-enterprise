import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { BrandingService } from '../branding/branding.service';
import { brandingLimits } from '../branding/branding.constants';

/** The registry checks the logo bytes, so the spec builds a real PNG header. */
function pngLogo(): string {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(64, 16);
  header.writeUInt32BE(64, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
}

/**
 * F2: the identity step writes through the settings registry, so the assertions
 * below check both halves — the wizard's own validation and the keys the
 * Settings screen reads later.
 */
async function createIdentityHarness() {
  return createInstallWizardHarness();
}

describe('InstallIdentityService', () => {
  it('stores the organisation name and shows the shipped defaults before it is saved', async () => {
    const harness = await createIdentityHarness();

    await expect(harness.identityService.getStatus()).resolves.toMatchObject({
      identity: {
        organizationName: '',
        appName: 'Service Desk',
        locale: 'bs',
        timeZone: 'Europe/Sarajevo',
        logoConfigured: false,
        isConfigured: false,
      },
    });

    const saved = await harness.identityService.save({
      organizationName: '  Gradska   uprava Visoko ',
    });
    expect(saved.organizationName).toBe('Gradska uprava Visoko');
    expect(saved.isConfigured).toBe(true);
    expect(saved.locale).toBe('bs');
  });

  it('writes every provided field and keeps the deferred ones untouched', async () => {
    const harness = await createIdentityHarness();

    await harness.identityService.save({
      organizationName: 'Gradska uprava Visoko',
      appName: 'Portala',
      locale: 'en',
      timeZone: 'Europe/Zagreb',
    });

    expect(harness.readStored(settingKeys.publicBrandingAppName)?.value).toBe(
      'Portala',
    );
    expect(
      harness.readStored(settingKeys.privateI18nDefaultLocale)?.value,
    ).toBe('en');
    expect(harness.readStored(settingKeys.privateReportsTimeZone)?.value).toBe(
      'Europe/Zagreb',
    );
    // "Podesi kasnije": nothing was posted for the logo or the contact fields,
    // so nothing was written.
    expect(harness.readStored(settingKeys.publicBrandingLogoDataUrl)).toBeUndefined();
    expect(harness.readStored(settingKeys.publicBrandingSupportEmail)).toBeUndefined();
    expect(harness.readStored(settingKeys.publicBrandingSupportUrl)).toBeUndefined();
  });

  it('logs every written key with the same reason and the founder as the actor', async () => {
    const harness = await createIdentityHarness();
    await harness.identityService.save({ organizationName: 'Visoko' });

    expect(
      harness.settingsMemory.changeLogs.map((entry) => entry.entityId).sort(),
    ).toEqual(
      [
        settingKeys.publicBrandingOrganizationName,
        settingKeys.privateI18nDefaultLocale,
      ].sort(),
    );
    expect(harness.settingsMemory.changeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: settingKeys.publicBrandingOrganizationName,
          reason: 'install_identity',
          actorUserId: harness.actorUserId,
        }),
      ]),
    );
  });

  it('keeps a stored logo when the operator leaves the field untouched', async () => {
    const harness = await createIdentityHarness();
    const logo = pngLogo();

    await harness.identityService.save({ organizationName: 'Visoko', logoDataUrl: logo });
    expect(harness.readStored(settingKeys.publicBrandingLogoDataUrl)?.value).toBe(
      logo,
    );

    const saved = await harness.identityService.save({ organizationName: 'Visoko' });
    expect(saved.logoConfigured).toBe(true);
    expect(harness.readStored(settingKeys.publicBrandingLogoDataUrl)?.value).toBe(
      logo,
    );
  });

  it('refuses an organisation name over the branding limit', async () => {
    const harness = await createIdentityHarness();

    await expect(
      harness.identityService.save({
        organizationName: 'a'.repeat(brandingLimits.organizationNameMaxLength + 1),
      }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_IDENTITY_INVALID' },
    });
  });

  it('refuses an empty organisation name', async () => {
    const harness = await createIdentityHarness();

    await expect(
      harness.identityService.save({ organizationName: '   ' }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_IDENTITY_INVALID' },
    });
  });

  it('refuses an unknown language and an unknown time zone', async () => {
    const harness = await createIdentityHarness();

    await expect(
      harness.identityService.save({
        organizationName: 'Visoko',
        locale: 'de' as 'bs',
      }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_IDENTITY_LOCALE_UNSUPPORTED' },
    });
    await expect(
      harness.identityService.save({
        organizationName: 'Visoko',
        timeZone: 'Europe/NePostoji',
      }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_IDENTITY_TIME_ZONE_UNKNOWN' },
    });
  });

  it('refuses a malformed contact address or support link', async () => {
    const harness = await createIdentityHarness();

    await expect(
      harness.identityService.save({
        organizationName: 'Visoko',
        supportEmail: 'podrska@',
      }),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_IDENTITY_INVALID' } });
    await expect(
      harness.identityService.save({
        organizationName: 'Visoko',
        supportUrl: 'http://podrska.example.com',
      }),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_IDENTITY_INVALID' } });
  });

  it('is visible on the sign-in page as soon as the step is saved', async () => {
    // F2 acceptance: the public branding endpoint reads the same keys, so the
    // identity the operator typed is what the login screen shows.
    const harness = await createIdentityHarness();
    const branding = new BrandingService(harness.settingsService);

    await harness.identityService.save({
      organizationName: 'Gradska uprava Visoko',
      appName: 'Portala',
    });

    await expect(branding.load()).resolves.toMatchObject({
      organizationName: 'Gradska uprava Visoko',
      appName: 'Portala',
    });
  });

  it('asks for the SuperAdmin before it writes anything', async () => {
    const harness = await createInstallWizardHarness({ withSuperAdmin: false });

    await expect(
      harness.identityService.save({ organizationName: 'Visoko' }),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_REQUIRED' } });
    expect(
      harness.readStored(settingKeys.publicBrandingOrganizationName),
    ).toBeUndefined();
  });
});
