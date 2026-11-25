import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DirectorySyncService } from '../directory-sync/directory-sync.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { SettingsService } from '../settings/settings.service';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
// W2.10b: this must stay a **value** import. With `import type` the emitted
// decorator metadata for the parameter is `Object`, so `@Optional()` silently
// injects `undefined` and every user list comes back empty (`X-Total-Count: 0`)
// while the guard still admits the caller. See `users.module.di.spec.ts`.
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { assignUserRole } from './assign-user-role';
import { createUser } from './create-user';
import { deleteUser } from './delete-user';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';
import { listUserRoles } from './list-user-roles';
import { listUsersSummary, listUsersSummaryPage } from './list-users-summary';
import { resolveUserListScope } from './resolve-user-list-scope';
import { readDisabledPolicyPackKeys } from '../policy-packs/read-disabled-policy-pack-keys';
import { mapUsersError } from './map-users-error';
import { removeUserRole } from './remove-user-role';
import type { ListUsersSummaryOptions } from './list-users-summary';
import { resetUserTemporaryPassword } from './reset-user-temporary-password';
import { unlinkUserDirectoryIdentity } from './unlink-user-directory-identity';
import { updateUser } from './update-user';
import type {
  AssignUserRoleInput,
  CreateUserInput,
  CreateUserResponse,
  RemoveUserRoleInput,
  ResetUserPasswordResponse,
  UpdateUserInput,
  UserAuditContext,
  UserRoleResponse,
  UserSummaryResponse,
} from './users.types';

const emptyAuditContext: UserAuditContext = { actorUserId: null, requestId: null };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly mailTransport: SmtpMailTransport,
    private readonly directorySyncService: DirectorySyncService,
    // Phase 2.2: optional so a unit test can build the service without Redis and
    // without the invalidation wiring; the module always provides it.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
    // Paket 5.4.0-d (M5): the online Pwned Passwords check for temporary
    // passwords. Optional so a unit test can build the service without a
    // network transport; the module always provides the real checker. Kept
    // last on purpose: existing positional construction keeps its meaning.
    @Optional()
    private readonly hibpPasswordChecker?: HibpPasswordChecker,
    // W2.10 (BA-users-01): the list has no resource id to scope, so it reads the
    // caller's units itself. Optional keeps every existing positional test
    // construction working; the module always provides the real loader, and a
    // missing loader narrows the list to nothing instead of widening it.
    @Optional()
    private readonly authorizationContextLoader?: AuthorizationContextLoader,
  ) {}

  /** Phase 2.2: hands the mutation functions the authorization cache hook. */
  private invalidatePrincipal(): (userId: string) => Promise<unknown> {
    return (userId) =>
      this.principalContextInvalidator?.invalidateUser(userId) ??
      Promise.resolve(null);
  }

  /**
   * Paket 5.3.2 (§4.4): the summary marks a pack as inactive when settings
   * switched it off, so the list has to know the disabled keys. Callers may
   * pass them explicitly (tests, single-user reloads); otherwise they are read
   * once per request from the settings registry.
   */
  private async withPolicyPackState(
    options: ListUsersSummaryOptions,
  ): Promise<ListUsersSummaryOptions> {
    if (options.disabledPolicyPackKeys !== undefined) {
      return options;
    }
    return {
      ...options,
      disabledPolicyPackKeys: await readDisabledPolicyPackKeys(
        this.settingsService,
      ),
    };
  }

  listSummary(
    options: ListUsersSummaryOptions = {},
  ): Promise<readonly UserSummaryResponse[]> {
    return this.execute(async () =>
      listUsersSummary(
        this.prisma,
        await this.withPolicyPackState(options),
      ),
    );
  }

  listSummaryPage(options: ListUsersSummaryOptions = {}) {
    return this.execute(async () =>
      listUsersSummaryPage(
        this.prisma,
        await this.withPolicyPackState(options),
      ),
    );
  }

  /**
   * W2.10 (`BA-users-01`): the HTTP list is the only read whose scope lives in
   * neither the URL nor the body. The caller's assignments decide which units
   * are visible; `organizationalUnitIds` is then resolved once per request and
   * pushed into the same query (and into the `total` count).
   */
  listSummaryPageForActor(
    actorUserId: string | null,
    options: ListUsersSummaryOptions = {},
  ): Promise<{ readonly items: readonly UserSummaryResponse[]; readonly total: number }> {
    return this.execute(async () => {
      if (this.authorizationContextLoader === undefined) {
        // Fail closed, but never silently: a missing loader narrows the list to
        // nothing, which looks like "no users exist" in the admin screen.
        this.logger.error(
          'user list scope unavailable: authorization context loader is not wired',
        );
      }
      const scope = resolveUserListScope(
        actorUserId === null || actorUserId.trim().length === 0
          ? null
          : await this.authorizationContextLoader?.loadBySubjectId(actorUserId.trim()),
      );
      const organizationalUnitIds = scope.unrestricted
        ? undefined
        : await this.resolveOrganizationalUnitIdsInScope(scope.organizationalUnitPaths);
      return listUsersSummaryPage(
        this.prisma,
        await this.withPolicyPackState({ ...options, organizationalUnitIds }),
      );
    });
  }

  /**
   * `ouPath` is the application identity of the tree, so a subtree is a prefix
   * match on the same rule the authorization evaluator uses (W2.9 keeps both in
   * `doesOrganizationalUnitScopeCover`; here the match happens in SQL).
   */
  private async resolveOrganizationalUnitIdsInScope(
    paths: readonly string[],
  ): Promise<readonly string[]> {
    if (paths.length === 0) {
      return [];
    }
    const units = await this.prisma.organizationalUnit.findMany({
      where: {
        OR: paths.flatMap((path) => [
          { ouPath: path },
          { ouPath: { startsWith: `${path}/` } },
        ]),
      },
      select: { id: true },
    });
    return units.map((unit) => unit.id);
  }

  create(input: CreateUserInput): Promise<CreateUserResponse> {
    return this.execute(() =>
      createUser(this.prisma, input, {
        settingsService: this.settingsService,
        mailTransport: this.mailTransport,
        hibpChecker: this.hibpPasswordChecker,
      }),
    );
  }

  resetTemporaryPassword(
    userId: string,
    context: UserAuditContext = emptyAuditContext,
  ): Promise<ResetUserPasswordResponse> {
    return this.execute(() =>
      resetUserTemporaryPassword(
        this.prisma,
        userId,
        {
          settingsService: this.settingsService,
          mailTransport: this.mailTransport,
          hibpChecker: this.hibpPasswordChecker,
          invalidatePrincipal: this.invalidatePrincipal(),
        },
        context,
      ),
    );
  }

  linkDirectoryIdentity(
    input: { readonly userId: string; readonly directoryExternalId: string },
    context: UserAuditContext = emptyAuditContext,
  ): Promise<UserSummaryResponse> {
    return this.execute(async () => {
      const response = await linkUserDirectoryIdentity({
        prisma: this.prisma,
        directorySyncService: this.directorySyncService,
        userId: input.userId,
        directoryExternalId: input.directoryExternalId,
        context,
        invalidatePrincipal: this.invalidatePrincipal(),
      });
      return response;
    });
  }

  unlinkDirectoryIdentity(
    userId: string,
    context: UserAuditContext = emptyAuditContext,
  ): Promise<ResetUserPasswordResponse> {
    return this.execute(() =>
      unlinkUserDirectoryIdentity(this.prisma, userId, {
        settingsService: this.settingsService,
        mailTransport: this.mailTransport,
        hibpChecker: this.hibpPasswordChecker,
        invalidatePrincipal: this.invalidatePrincipal(),
      }, context),
    );
  }

  update(
    input: UpdateUserInput,
    context: UserAuditContext = emptyAuditContext,
  ): Promise<UserSummaryResponse> {
    return this.execute(() =>
      updateUser(this.prisma, input, this.invalidatePrincipal(), context),
    );
  }

  delete(
    userId: string,
    context: UserAuditContext = emptyAuditContext,
  ): Promise<void> {
    return this.execute(() =>
      deleteUser(this.prisma, userId, this.invalidatePrincipal(), context),
    );
  }

  listRoles(userId: string): Promise<readonly UserRoleResponse[]> {
    return this.execute(() => listUserRoles(this.prisma, userId));
  }

  assignRole(input: AssignUserRoleInput): Promise<UserRoleResponse> {
    return this.execute(() =>
      assignUserRole(this.prisma, input, this.invalidatePrincipal()),
    );
  }

  removeRole(input: RemoveUserRoleInput): Promise<void> {
    return this.execute(() =>
      removeUserRole(this.prisma, input, this.invalidatePrincipal()),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      mapUsersError(error);
    }
  }
}
