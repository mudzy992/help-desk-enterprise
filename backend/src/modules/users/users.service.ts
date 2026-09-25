import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DirectorySyncService } from '../directory-sync/directory-sync.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { SettingsService } from '../settings/settings.service';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { assignUserRole } from './assign-user-role';
import { createUser } from './create-user';
import { deleteUser } from './delete-user';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';
import { listUserRoles } from './list-user-roles';
import { listUsersSummary } from './list-users-summary';
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
  UserRoleResponse,
  UserSummaryResponse,
} from './users.types';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly mailTransport: SmtpMailTransport,
    private readonly directorySyncService: DirectorySyncService,
    // Phase 2.2: optional so a unit test can build the service without Redis and
    // without the invalidation wiring; the module always provides it.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  /** Phase 2.2: hands the mutation functions the authorization cache hook. */
  private invalidatePrincipal(): (userId: string) => Promise<unknown> {
    return (userId) =>
      this.principalContextInvalidator?.invalidateUser(userId) ??
      Promise.resolve(null);
  }

  listSummary(
    options: ListUsersSummaryOptions = {},
  ): Promise<readonly UserSummaryResponse[]> {
    return this.execute(() => listUsersSummary(this.prisma, options));
  }

  create(input: CreateUserInput): Promise<CreateUserResponse> {
    return this.execute(() =>
      createUser(this.prisma, input, {
        settingsService: this.settingsService,
        mailTransport: this.mailTransport,
      }),
    );
  }

  resetTemporaryPassword(userId: string): Promise<ResetUserPasswordResponse> {
    return this.execute(() =>
      resetUserTemporaryPassword(this.prisma, userId, {
        settingsService: this.settingsService,
        mailTransport: this.mailTransport,
      }),
    );
  }

  linkDirectoryIdentity(input: {
    readonly userId: string;
    readonly directoryExternalId: string;
  }): Promise<UserSummaryResponse> {
    return this.execute(() =>
      linkUserDirectoryIdentity({
        prisma: this.prisma,
        directorySyncService: this.directorySyncService,
        userId: input.userId,
        directoryExternalId: input.directoryExternalId,
      }),
    );
  }

  unlinkDirectoryIdentity(
    userId: string,
  ): Promise<ResetUserPasswordResponse> {
    return this.execute(() =>
      unlinkUserDirectoryIdentity(this.prisma, userId, {
        settingsService: this.settingsService,
        mailTransport: this.mailTransport,
      }),
    );
  }

  update(input: UpdateUserInput): Promise<UserSummaryResponse> {
    return this.execute(() =>
      updateUser(this.prisma, input, this.invalidatePrincipal()),
    );
  }

  delete(userId: string): Promise<void> {
    return this.execute(() =>
      deleteUser(this.prisma, userId, this.invalidatePrincipal()),
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
