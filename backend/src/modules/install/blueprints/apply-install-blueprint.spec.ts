import { defaultRoutingConfiguration } from '../../routing/routing.constants';
import { routingOutcomes } from '../../routing/routing.constants';
import { resolveTicketRouting } from '../../routing/resolve-ticket-routing';
import { defaultServiceFormsConfiguration } from '../../service-catalog/service-forms.constants';
import { defaultServiceLifecycleConfiguration } from '../../service-catalog/service-catalog.constants';
import { createInstallWizardHarness } from '../create-install-wizard-harness';
import { applyInstallBlueprint } from './apply-install-blueprint';
import { getInstallBlueprint } from './install-blueprint.registry';
import { InstallBlueprintError } from './install-blueprint.error';

/**
 * F4.2 acceptance: five categories, a routing rule that resolves `EXACT` for every
 * request type, and re-applying a blueprint never duplicates a row. The F2 seed has
 * already created „Opšte / Opšti zahtjev“ (slug `opsti-zahtjev`), so the blueprint
 * must recognise it — that is the whole point of matching by slug.
 */
async function applyOnce(
  harness: Awaited<ReturnType<typeof createInstallWizardHarness>>,
  input: {
    readonly includeServices?: readonly string[];
    readonly createTierGroups?: boolean;
    readonly locale?: 'bs' | 'en';
  } = {},
) {
  const seed = await harness.seedMinimum();
  return applyInstallBlueprint(harness.prisma, {
    blueprint: getInstallBlueprint('itServiceDesk')!,
    locale: input.locale ?? 'bs',
    includeServices: input.includeServices,
    createTierGroups: input.createTierGroups === true,
    originUnitId: seed.organizationalUnit!.id,
    handlerGroupId: seed.fallbackGroup!.id,
    actorUserId: harness.actorUserId,
    lifecycle: defaultServiceLifecycleConfiguration,
    routing: defaultRoutingConfiguration,
    forms: defaultServiceFormsConfiguration,
    slaProfile: { id: 'sla-standard', key: 'STANDARD_REQUEST' },
  });
}

describe('applyInstallBlueprint', () => {
  it('builds the IT catalog and reuses what the structure step already seeded', async () => {
    const harness = await createInstallWizardHarness();
    const result = await applyOnce(harness);

    // 5 categories / 10 request types, minus the „Opšte / Opšti zahtjev“ the seed
    // already created.
    expect(result.createdCategoryCount).toBe(4);
    expect(result.createdServiceCount).toBe(9);
    expect(result.existingServiceCount).toBe(1);
    expect(result.services).toHaveLength(10);
    expect(result.services.map((service) => service.slug)).toContain(
      'opsti-zahtjev',
    );
    expect(
      result.services.find((service) => service.slug === 'opsti-zahtjev')?.created,
    ).toBe(false);
  });

  it('is idempotent: a second apply creates nothing', async () => {
    const harness = await createInstallWizardHarness();
    await applyOnce(harness);
    const again = await applyOnce(harness);

    expect(again.createdCategoryCount).toBe(0);
    expect(again.createdServiceCount).toBe(0);
    expect(again.existingServiceCount).toBe(10);
  });

  it('routes every request type to the handler group (EXACT, not a fallback)', async () => {
    const harness = await createInstallWizardHarness();
    const seed = await harness.seedMinimum();
    const result = await applyOnce(harness);

    for (const service of result.services) {
      const resolution = await resolveTicketRouting(
        harness.prisma,
        { originUnitId: seed.organizationalUnit!.id, serviceId: service.serviceId },
        defaultRoutingConfiguration,
      );
      expect({
        slug: service.slug,
        outcome: resolution.outcome,
      }).toEqual({ slug: service.slug, outcome: routingOutcomes.exact });
      expect(service.routed).toBe(true);
    }
  });

  it('creates the optional tier groups once and routes to tier 1', async () => {
    const harness = await createInstallWizardHarness();
    const first = await applyOnce(harness, { createTierGroups: true });
    const second = await applyOnce(harness, { createTierGroups: true });

    expect(first.createdTierGroupCount).toBe(2);
    expect(first.tierGroupKeys).toEqual(['nivo-1', 'nivo-2']);
    expect(second.createdTierGroupCount).toBe(0);
    const seed = await harness.seedMinimum();
    const resolution = await resolveTicketRouting(
      harness.prisma,
      {
        originUnitId: seed.organizationalUnit!.id,
        serviceId: first.services[0].serviceId,
      },
      defaultRoutingConfiguration,
    );
    // The rule points at „Nivo 1 podrška“, not at the fallback group.
    const tier1 = await harness.prisma.group.findFirst({
      where: { key: 'nivo-1' },
    });
    expect(resolution.groupId).toBe(tier1?.id);
  });

  it('creates only the request types the operator left switched on', async () => {
    const harness = await createInstallWizardHarness();
    const result = await applyOnce(harness, {
      includeServices: ['computerEquipment', 'vpnRemoteAccess'],
    });

    expect(result.services.map((service) => service.key)).toEqual([
      'computerEquipment',
      'vpnRemoteAccess',
    ]);
    expect(result.createdCategoryCount).toBe(2);
  });

  it('refuses an unknown request type instead of reporting a smaller catalog', async () => {
    const harness = await createInstallWizardHarness();
    await harness.seedMinimum();

    await expect(
      applyOnce(harness, { includeServices: ['notARequestType'] }),
    ).rejects.toBeInstanceOf(InstallBlueprintError);
  });

  it('names the created rows in the locale the operator is reading', async () => {
    const harness = await createInstallWizardHarness();
    const english = await applyOnce(harness, {
      locale: 'en',
      includeServices: ['softwareLicences'],
    });

    expect(english.services[0].name).toBe('Installation and licences');
    const bosnian = await applyOnce(harness, {
      locale: 'bs',
      includeServices: ['networkConnectivity'],
    });
    expect(bosnian.services[0].name).toBe('Mrežna veza i Wi-Fi');
  });
});
