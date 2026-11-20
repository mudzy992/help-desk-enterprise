import { permissionKeys } from '../authorization/authorization.constants';
import { changeLimits } from './changes.constants';
import { ChangesService } from './changes.service';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scope = { all: true as const };

function unitRow(index: number) {
  return { id: `ou-${index}`, name: `Jedinica ${index}`, ouPath: `/Jedinica/${index}` };
}

function buildService(units: readonly unknown[]) {
  const prisma = {
    organizationalUnit: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => units) },
    service: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => []) },
    group: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => []) },
    changeTemplate: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => []) },
  };
  const access = {
    require: jest.fn(async () => scope),
    hasPermission: jest.fn(() => true),
    scopeOf: jest.fn(async () => scope),
    configuration: jest.fn(async () => ({
      numberPrefix: 'CHG',
      normalQuorum: 1,
      emergencyQuorum: 1,
      minLeadTimeHours: 0,
      requireTestPlan: false,
      freezePeriods: [],
      reminderHoursBeforeStart: 24,
      timeZone: 'UTC',
    })),
  };
  const service = new ChangesService(prisma as never, access as never, {} as never, {} as never);
  return { prisma, access, service };
}

describe('change form options truncation (BA-changes-18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('names the pickers it had to cut instead of returning a silently short list', async () => {
    const units = Array.from({ length: changeLimits.optionsUnitsMax + 1 }, (_, index) => unitRow(index));
    const { prisma, service } = buildService(units);

    const options = await service.options(viewer);

    expect((prisma.organizationalUnit.findMany.mock.calls[0][0] as QueryArgs).take).toBe(
      changeLimits.optionsUnitsMax + 1,
    );
    expect(options.units).toHaveLength(changeLimits.optionsUnitsMax);
    expect(options.truncated).toEqual({ units: true, services: false, cabGroups: false, templates: false });
  });

  it('reports every picker as complete when the lists fit', async () => {
    const { service } = buildService([unitRow(0), unitRow(1)]);

    const options = await service.options(viewer);

    expect(options.units).toHaveLength(2);
    expect(options.truncated).toEqual({ units: false, services: false, cabGroups: false, templates: false });
  });

  it('still requires change.read to build the form', async () => {
    const { access, service } = buildService([]);

    await service.options(viewer);

    expect(access.require).toHaveBeenCalledWith(viewer, permissionKeys.changeRead);
  });
});
