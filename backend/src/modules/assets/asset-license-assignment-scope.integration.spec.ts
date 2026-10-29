import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { AssetLicensesService } from './asset-licenses.service';
import { assetErrorCodes } from './assets.constants';
import type { AssetViewer } from './asset-viewer';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset license assignment OU and scope (PostgreSQL integration, W7.7)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let licenses: AssetLicensesService;
  let stamp: string;
  let actorId: string;
  let rootUnitId: string;
  let licenseUnitId: string;
  let teamUnitId: string;
  let siblingUnitId: string;
  let foreignUnitId: string;
  let rootPath: string;
  let licensePath: string;
  let teamPath: string;
  let siblingPath: string;
  let foreignPath: string;
  let sequence = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const settings = {
      getSetting: async (key: string) => (key === settingKeys.privateAddonsCmdb ? true : undefined),
    };
    const access = new AssetAccessService(prisma as never, settings as never);
    licenses = new AssetLicensesService(prisma as never, access);

    stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    rootPath = `/asset-license-scope-${stamp}`;
    licensePath = `${rootPath}/licenses`;
    teamPath = `${licensePath}/team`;
    siblingPath = `${rootPath}/other`;
    foreignPath = `/asset-license-foreign-${stamp}`;

    const root = await prisma.organizationalUnit.create({
      data: {
        name: `License scope root ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=LicenseScopeRoot${stamp}`,
        ouPath: rootPath,
      },
      select: { id: true },
    });
    rootUnitId = root.id;
    const [licenseUnit, siblingUnit, foreignUnit] = await Promise.all([
      prisma.organizationalUnit.create({
        data: {
          name: `License owner unit ${stamp}`,
          type: 'SERVICE',
          distinguishedName: `OU=LicenseOwner${stamp}`,
          ouPath: licensePath,
          parentId: rootUnitId,
        },
        select: { id: true },
      }),
      prisma.organizationalUnit.create({
        data: {
          name: `License sibling unit ${stamp}`,
          type: 'SERVICE',
          distinguishedName: `OU=LicenseSibling${stamp}`,
          ouPath: siblingPath,
          parentId: rootUnitId,
        },
        select: { id: true },
      }),
      prisma.organizationalUnit.create({
        data: {
          name: `Foreign license unit ${stamp}`,
          type: 'DIRECTORATE',
          distinguishedName: `OU=ForeignLicense${stamp}`,
          ouPath: foreignPath,
        },
        select: { id: true },
      }),
    ]);
    licenseUnitId = licenseUnit.id;
    siblingUnitId = siblingUnit.id;
    foreignUnitId = foreignUnit.id;
    const teamUnit = await prisma.organizationalUnit.create({
      data: {
        name: `License team ${stamp}`,
        type: 'SERVICE',
        distinguishedName: `OU=LicenseTeam${stamp}`,
        ouPath: teamPath,
        parentId: licenseUnitId,
      },
      select: { id: true },
    });
    teamUnitId = teamUnit.id;
    const actor = await prisma.user.create({
      data: {
        email: `asset-license-scope-actor-${stamp}@example.invalid`,
        displayName: `License scope actor ${stamp}`,
        organizationalUnitId: rootUnitId,
      },
      select: { id: true },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function viewer(
    readScope: { readonly global: boolean; readonly unitPath: string | null },
    manageScope: { readonly global: boolean; readonly unitPath: string | null } = {
      global: false,
      unitPath: rootPath,
    },
  ): AssetViewer {
    return {
      userId: actorId,
      isSuperAdmin: false,
      homeOrganizationalUnitId: rootUnitId,
      grants: [
        {
          permission: permissionKeys.assetLicenseManage,
          global: manageScope.global,
          unitPath: manageScope.unitPath,
        },
        {
          permission: permissionKeys.assetRead,
          global: readScope.global,
          unitPath: readScope.unitPath,
        },
      ],
    };
  }

  function scopedViewer(): AssetViewer {
    return viewer({ global: false, unitPath: licensePath });
  }

  function globalViewer(): AssetViewer {
    return viewer({ global: true, unitPath: null }, { global: true, unitPath: null });
  }

  async function createUser(input: {
    readonly ouId: string;
    readonly displayName: string;
    readonly email: string;
  }): Promise<string> {
    const row = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        organizationalUnitId: input.ouId,
      },
      select: { id: true },
    });
    return row.id;
  }

  async function createLicense(organizationalUnitId = licenseUnitId) {
    sequence += 1;
    const row = await prisma.softwareLicense.create({
      data: {
        productName: `W7.7 scope licence ${stamp} ${sequence}`,
        kind: 'PER_USER',
        seats: 4,
        organizationalUnitId,
      },
      select: { id: true, productName: true, kind: true, seats: true, vendor: true },
    });
    return row;
  }

  function saveInput(license: Awaited<ReturnType<typeof createLicense>>, organizationalUnitId: string) {
    return {
      productName: license.productName,
      vendor: license.vendor,
      kind: license.kind,
      seats: license.seats,
      validUntil: null,
      cost: null,
      notes: null,
      organizationalUnitId,
    } as const;
  }

  it('limits license user-picker results to the reader scope and license OU subtree', async () => {
    const license = await createLicense();
    const search = `license-candidate-${stamp}`;
    const visibleUserId = await createUser({
      ouId: teamUnitId,
      displayName: `Visible ${search}`,
      email: `asset-${search}-visible@example.invalid`,
    });
    await createUser({
      ouId: siblingUnitId,
      displayName: `Sibling ${search}`,
      email: `asset-${search}-sibling@example.invalid`,
    });
    await createUser({
      ouId: foreignUnitId,
      displayName: `Foreign ${search}`,
      email: `asset-${search}-foreign@example.invalid`,
    });

    const candidates = await licenses.searchUserCandidates(license.id, search, scopedViewer());

    expect(candidates.items.map((user) => user.id)).toEqual([visibleUserId]);
  });

  it('allows a user in the license OU subtree and the reader scope', async () => {
    const license = await createLicense();
    const userId = await createUser({
      ouId: teamUnitId,
      displayName: `Visible license user ${stamp}`,
      email: `asset-license-visible-${stamp}@example.invalid`,
    });

    const detail = await licenses.assign(license.id, { userId }, scopedViewer());

    expect(detail.assignments).toHaveLength(1);
    expect(detail.assignments[0]?.user).toMatchObject({ id: userId, displayName: `Visible license user ${stamp}` });
    expect(detail.hiddenAssignmentsCount).toBe(0);
  });

  it('rejects an in-scope user from a sibling OU that is not covered by the license OU', async () => {
    const license = await createLicense();
    const userId = await createUser({
      ouId: siblingUnitId,
      displayName: `Sibling license user ${stamp}`,
      email: `asset-license-sibling-${stamp}@example.invalid`,
    });
    // The actor may read this user, but only manages licenses under rootPath;
    // the license's more specific OU still governs assignment compatibility.
    const reader = viewer({ global: true, unitPath: null });

    await expect(licenses.assign(license.id, { userId }, reader)).rejects.toMatchObject({
      code: assetErrorCodes.licenseAssignmentInvalid,
      detail: 'organizationalUnitId',
    });
    await expect(prisma.licenseAssignment.count({ where: { licenseId: license.id } })).resolves.toBe(0);
  });

  it('returns not-found for a target user outside the caller read scope', async () => {
    const license = await createLicense();
    const userId = await createUser({
      ouId: foreignUnitId,
      displayName: `Out-of-scope license user ${stamp}`,
      email: `asset-license-outside-${stamp}@example.invalid`,
    });

    await expect(licenses.assign(license.id, { userId }, scopedViewer())).rejects.toMatchObject({
      code: assetErrorCodes.userNotFound,
    });
    await expect(prisma.licenseAssignment.count({ where: { licenseId: license.id } })).resolves.toBe(0);
  });

  it('does not return legacy foreign-user PII in license detail', async () => {
    const license = await createLicense();
    const displayName = `Legacy foreign license user ${stamp}`;
    const email = `asset-license-legacy-foreign-${stamp}@example.invalid`;
    const userId = await createUser({ ouId: foreignUnitId, displayName, email });
    await prisma.licenseAssignment.create({
      data: { licenseId: license.id, userId, assignedByUserId: actorId },
    });

    const detail = await licenses.detail(license.id, scopedViewer());
    const serialized = JSON.stringify(detail);

    expect(detail.assignments).toHaveLength(0);
    expect(detail.hiddenAssignmentsCount).toBe(1);
    expect(detail.used).toBe(1);
    expect(serialized).not.toContain(userId);
    expect(serialized).not.toContain(displayName);
    expect(serialized).not.toContain(email);
  });

  it('keeps a moved license from stranding its existing user assignments', async () => {
    const license = await createLicense();
    const userId = await createUser({
      ouId: teamUnitId,
      displayName: `Assigned before license move ${stamp}`,
      email: `asset-license-move-${stamp}@example.invalid`,
    });
    await licenses.assign(license.id, { userId }, globalViewer());

    await expect(licenses.update(license.id, saveInput(license, foreignUnitId), globalViewer())).rejects.toMatchObject({
      code: assetErrorCodes.licenseAssignmentInvalid,
      detail: 'organizationalUnitId',
    });
    await expect(prisma.softwareLicense.findUniqueOrThrow({ where: { id: license.id }, select: { organizationalUnitId: true } })).resolves.toEqual({
      organizationalUnitId: licenseUnitId,
    });
    await expect(prisma.licenseAssignment.count({ where: { licenseId: license.id } })).resolves.toBe(1);
  });

  it('redacts a user assignment after the user moves outside the reader and license OU', async () => {
    const license = await createLicense();
    const displayName = `Moved license user ${stamp}`;
    const email = `asset-license-moved-${stamp}@example.invalid`;
    const userId = await createUser({ ouId: teamUnitId, displayName, email });
    await licenses.assign(license.id, { userId }, scopedViewer());
    await prisma.user.update({ where: { id: userId }, data: { organizationalUnitId: foreignUnitId } });

    const detail = await licenses.detail(license.id, scopedViewer());
    const serialized = JSON.stringify(detail);

    expect(detail.assignments).toHaveLength(0);
    expect(detail.hiddenAssignmentsCount).toBe(1);
    expect(serialized).not.toContain(userId);
    expect(serialized).not.toContain(displayName);
    expect(serialized).not.toContain(email);
  });
});
