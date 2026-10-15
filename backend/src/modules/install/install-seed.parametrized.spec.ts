import { createInstallWizardHarness } from './create-install-wizard-harness';
import { installSeedSlaProfileKey } from './install-seed-sla-profile';

/**
 * F2: the structure step is the parametrized seed. These assertions cover the
 * three states the API must support — no body (pre-v2 defaults, used by
 * `e2e/helpers/ensure-install.ts`), custom names, and a repeated seed that must
 * never rename what already exists.
 */
async function createSeedHarness() {
  const harness = await createInstallWizardHarness();
  harness.memory.seedSlaProfile({
    id: 'sla-standard',
    key: installSeedSlaProfileKey,
    name: 'Standardni zahtjev',
    isActive: true,
  });
  return harness;
}

describe('InstallSeedService parametrized structure', () => {
  it('keeps the pre-v2 defaults when no body is sent', async () => {
    const harness = await createSeedHarness();

    const result = await harness.seedService.seed();

    expect(result.isSeeded).toBe(true);
    expect(result.organizationalUnit?.name).toBe('Direkcija');
    expect(result.fallbackGroup).toMatchObject({ name: 'Fallback', key: 'fallback' });
    expect(result.service).toMatchObject({
      name: 'Opšti zahtjev',
      slug: 'opsti-zahtjev',
      slaProfileKey: installSeedSlaProfileKey,
    });
    expect(result.warning).toBeUndefined();
    expect(result.created).toMatchObject({
      organizationalUnit: true,
      fallbackGroup: true,
      service: true,
    });
  });

  it('creates the unit, group, category and service under the names the operator typed', async () => {
    const harness = await createSeedHarness();

    const result = await harness.seedService.seed({
      organizationalUnitName: 'Gradska uprava Visoko',
      handlerGroupName: 'Podrška',
      serviceName: 'Zahtjev za pomoć',
      categoryName: 'Opće usluge',
    });

    expect(result.isSeeded).toBe(true);
    expect(result.organizationalUnit?.name).toBe('Gradska uprava Visoko');
    expect(result.fallbackGroup?.name).toBe('Podrška');
    expect(result.categoryName).toBe('Opće usluge');
    expect(result.service?.name).toBe('Zahtjev za pomoć');
    // Keys are derived from the names, never a fixed literal.
    expect(result.service?.slug).toBe('zahtjev-za-pomoc');
    expect(result.fallbackGroup?.key).toBe('podrska');
    expect(result.service?.slaProfileKey).toBe(installSeedSlaProfileKey);
    expect(
      harness.memory.listGroupMembers(result.fallbackGroup?.id ?? ''),
    ).toHaveLength(1);
  });

  it('never renames what already exists on a repeated seed with other names', async () => {
    const harness = await createSeedHarness();
    await harness.seedService.seed({
      organizationalUnitName: 'Gradska uprava Visoko',
      serviceName: 'Zahtjev za pomoć',
    });

    const repeated = await harness.seedService.seed({
      organizationalUnitName: 'Drugo ime',
      handlerGroupName: 'Druga grupa',
      serviceName: 'Drugi servis',
    });

    expect(repeated.isSeeded).toBe(true);
    expect(repeated.organizationalUnit?.name).toBe('Gradska uprava Visoko');
    expect(repeated.service?.name).toBe('Zahtjev za pomoć');
    expect(repeated.created).toMatchObject({
      organizationalUnit: false,
      service: false,
    });
    expect(repeated.warning).toEqual({
      code: 'NAMES_ALREADY_SEEDED',
      requested: {
        organizationalUnitName: 'Drugo ime',
        handlerGroupName: 'Druga grupa',
        categoryName: 'Opšte',
        serviceName: 'Drugi servis',
      },
      stored: {
        organizationalUnitName: 'Gradska uprava Visoko',
        handlerGroupName: 'Fallback',
        categoryName: 'Opšte',
        serviceName: 'Zahtjev za pomoć',
      },
    });
  });

  it('reports the stored names and the SLA profile through the status read', async () => {
    const harness = await createSeedHarness();
    await harness.seedService.seed({
      organizationalUnitName: 'Gradska uprava Visoko',
      handlerGroupName: 'Podrška',
      serviceName: 'Zahtjev za pomoć',
      categoryName: 'Opće usluge',
    });

    const status = await harness.seedService.getStatus();

    expect(status.seed).toMatchObject({
      isSeeded: true,
      organizationalUnit: { name: 'Gradska uprava Visoko' },
      fallbackGroup: { name: 'Podrška', key: 'podrska' },
      service: { name: 'Zahtjev za pomoć', slaProfileKey: installSeedSlaProfileKey },
    });
  });

  it('leaves the service without SLA when the deployment has no profile yet', async () => {
    const harness = await createInstallWizardHarness();

    const result = await harness.seedService.seed();

    expect(result.service?.slaProfileId ?? null).toBeNull();
    expect(result.service?.slaProfileKey ?? null).toBeNull();
  });

  it('refuses names that cannot become a key or a distinguished name', async () => {
    const harness = await createSeedHarness();

    await expect(
      harness.seedService.seed({ organizationalUnitName: 'Direkcija, DC=local' }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_SEED_STRUCTURE_INVALID' },
    });
    await expect(
      harness.seedService.seed({ serviceName: 'a'.repeat(121) }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_SEED_STRUCTURE_INVALID' },
    });
  });
});
