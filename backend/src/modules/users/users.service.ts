import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DirectorySyncService } from '../directory-sync/directory-sync.service';
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
  ) {}

  listSummary(): Promise<readonly UserSummaryResponse[]> {
    return this.execute(() => listUsersSummary(this.prisma));
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
    return this.execute(() => updateUser(this.prisma, input));
  }

  delete(userId: string): Promise<void> {
    return this.execute(() => deleteUser(this.prisma, userId));
  }

  listRoles(userId: string): Promise<readonly UserRoleResponse[]> {
    return this.execute(() => listUserRoles(this.prisma, userId));
  }

  assignRole(input: AssignUserRoleInput): Promise<UserRoleResponse> {
    return this.execute(() => assignUserRole(this.prisma, input));
  }

  removeRole(input: RemoveUserRoleInput): Promise<void> {
    return this.execute(() => removeUserRole(this.prisma, input));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      mapUsersError(error);
    }
  }
}
