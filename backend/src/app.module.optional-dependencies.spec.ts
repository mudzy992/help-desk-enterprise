import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { integrationQueueName } from './modules/integration-queue/integration-queue.constants';
import { reportSchedulesQueueName } from './modules/reports/schedules/report-schedule.constants';
import { privacyQueueName } from './modules/privacy/privacy.constants';
import { UsersService } from './modules/users/users.service';
import { resolveUserListScope } from './modules/users/resolve-user-list-scope';
import { permissionKeys } from './modules/authorization/authorization.constants';
import { PolicyPacksService } from './modules/policy-packs/policy-packs.service';
import { ReportSummaryService } from './modules/reports/report-summary.service';

jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {
    async onModuleInit(): Promise<void> {}
    async onModuleDestroy(): Promise<void> {}
  },
}));

function fakeQueue(): unknown {
  return { add: jest.fn(), close: jest.fn(), on: jest.fn() };
}

/**
 * W2.10b (`BA-users-01` regression, 2026-10-29): the production admin screen
 * showed an **empty** user list while the SuperAdmin could sign in and open the
 * page. `UsersService` took `AuthorizationContextLoader` through
 * `import type`, which erases the emitted param type to `Object`; `@Optional()`
 * then injected `undefined` without a word, `resolveUserListScope(undefined)`
 * returned the empty scope, and `GET /users` answered `[]` with
 * `X-Total-Count: 0`. Unit tests never caught it because they pass the loader
 * positionally.
 *
 * This test therefore asserts the real Nest graph, not a hand-built service: the
 * constructor must receive every optional collaborator the module is supposed to
 * provide.
 */
describe('UsersModule dependency graph (W2.10b)', () => {
  let moduleRef: Awaited<ReturnType<typeof compileAppModule>>;

  async function compileAppModule() {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';
    process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/servicedesk';
    return Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getQueueToken(integrationQueueName))
      .useValue(fakeQueue())
      .overrideProvider(getQueueToken(reportSchedulesQueueName))
      .useValue(fakeQueue())
      .overrideProvider(getQueueToken(privacyQueueName))
      .useValue(fakeQueue())
      .compile();
  }

  beforeEach(async () => {
    moduleRef = await compileAppModule();
  }, 60_000);

  afterEach(async () => {
    await moduleRef.close();
  });

  it('injects the authorization context loader into UsersService', () => {
    const service = moduleRef.get(UsersService, { strict: false });
    const collaborators = service as unknown as Record<string, unknown>;
    expect(collaborators.authorizationContextLoader).toBeDefined();
    expect(
      typeof (collaborators.authorizationContextLoader as { loadBySubjectId?: unknown })
        .loadBySubjectId,
    ).toBe('function');
    // The other optional collaborators were already resolved; keep them pinned so
    // the same `import type` mistake cannot move here unnoticed.
    expect(collaborators.principalContextInvalidator).toBeDefined();
    expect(collaborators.hibpPasswordChecker).toBeDefined();
  });

  it('injects the settings service into the optional consumers that declare it', () => {
    // Same class of bug, found by the same audit: `import type` + `@Optional()`.
    const policyPacks = moduleRef.get(PolicyPacksService, { strict: false }) as unknown as Record<
      string,
      unknown
    >;
    const reportSummary = moduleRef.get(ReportSummaryService, {
      strict: false,
    }) as unknown as Record<string, unknown>;
    expect(policyPacks.settingsService).toBeDefined();
    expect(reportSummary.settingsService).toBeDefined();
  });

  it('proves the failure mode this wiring caused: no loader means no list scope', () => {
    // The regression in one assertion: without the loader the scope is empty, so
    // every user list query is narrowed to no organizational unit.
    expect(resolveUserListScope(undefined)).toEqual({
      unrestricted: false,
      organizationalUnitPaths: [],
    });
    // ...and with the SuperAdmin context the loader really would produce, the
    // same route is unrestricted - i.e. the empty list was never a product rule.
    expect(
      resolveUserListScope({
        subjectId: 'super-admin-1',
        isLocalOnly: true,
        isSuperAdmin: true,
        assignments: [
          {
            roleKey: 'SUPER_ADMIN',
            permissionKeys: [permissionKeys.userManage],
            organizationalUnitId: null,
            organizationalUnitPath: null,
            serviceId: null,
          },
        ],
      }),
    ).toEqual({ unrestricted: true, organizationalUnitPaths: [] });
  });
});
