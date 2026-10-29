import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GroupsError } from '../groups/groups.error';
import { addGroupMember } from '../groups/add-group-member';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { SettingsService } from '../settings/settings.service';
import { createUser } from '../users/create-user';
import { UsersError } from '../users/users.error';
import type {
  CreateUserInput,
  TemporaryPasswordDelivery,
} from '../users/users.types';
import { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { findInstallFallbackGroup } from './ensure-install-fallback-group';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installTeamErrorCodes } from './install-team.constants';
import { InstallTeamError } from './install-team.error';
import { mapInstallTeamError } from './map-install-team-error';
import { readInstallTeamStatus } from './read-install-team-status';
import { validateInstallTeam } from './validate-install-team';
import type {
  CreatedInstallTeamMember,
  InstallTeamInput,
  InstallTeamResult,
  InstallTeamStatus,
} from './install-team.types';

/**
 * The account-creation dependency. `createUser` satisfies it; a spec passes its
 * own (the same seam `createInstallSuperAdmin` uses for the password hasher), so
 * the team step can be exercised without the whole users module.
 */
export type CreateInstallTeamMember = (
  prisma: PrismaService,
  input: CreateUserInput,
  dependencies: {
    readonly settingsService: SettingsService;
    readonly mailTransport: MailTransport;
    readonly hibpChecker?: HibpPasswordChecker;
  },
) => Promise<{
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: TemporaryPasswordDelivery;
}>;

/**
 * F2: creating a team member is a domain operation, not a wizard one — the
 * service calls the same `createUser` the users endpoint uses (same validators,
 * same audit entries, same temporary-password contract) and the same
 * `addGroupMember` as `POST /groups/:groupId/members/:userId`. The wizard owns
 * only the handler group: it picks the group created in the structure step, so
 * the operator never chooses one before anything exists.
 */
@Injectable()
export class InstallTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
    // Optional, like everywhere else that issues temporary passwords: a unit
    // test builds the service without a network transport and the checker is
    // simply skipped (fail-open, the same rule the users module follows).
    @Optional()
    private readonly hibpChecker?: HibpPasswordChecker,
  ) {}

  async getStatus(): Promise<InstallTeamStatus> {
    return this.execute(async () => ({ team: await readInstallTeamStatus(this.prisma) }));
  }

  async save(
    input: InstallTeamInput,
    createMember: CreateInstallTeamMember = createUser,
  ): Promise<InstallTeamResult> {
    return this.execute(async () => {
      const { members } = validateInstallTeam(input);
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallTeamError(installTeamErrorCodes.superAdminRequired);
      }
      const actorUserId = superAdmin.id;
      const group = await findInstallFallbackGroup(this.prisma);
      if (group === null) {
        throw new InstallTeamError(installTeamErrorCodes.groupMissing);
      }
      const created: CreatedInstallTeamMember[] = [];
      for (const member of members) {
        created.push(await this.invite(member, group, actorUserId, createMember));
      }
      return { ...(await readInstallTeamStatus(this.prisma)), created };
    });
  }

  private async invite(
    member: InstallTeamInput['members'][number],
    group: { readonly id: string; readonly organizationalUnitId: string | null },
    actorUserId: string,
    createMember: CreateInstallTeamMember,
  ): Promise<CreatedInstallTeamMember> {
    const response = await this.createAccount(member, group, actorUserId, createMember);
    await this.joinGroup(group.id, response.user.id, actorUserId);
    return {
      userId: response.user.id,
      email: response.user.email,
      displayName: response.user.displayName,
      roleKey: member.roleKey,
      // Owner decision 2: without SMTP the password is shown once on screen.
      temporaryPassword: response.temporaryPassword,
      temporaryPasswordDelivery: response.temporaryPasswordDelivery,
    };
  }

  private async createAccount(
    member: InstallTeamInput['members'][number],
    group: { readonly organizationalUnitId: string | null },
    actorUserId: string,
    createMember: CreateInstallTeamMember,
  ): Promise<{
    readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
    readonly temporaryPassword: string | null;
    readonly temporaryPasswordDelivery: TemporaryPasswordDelivery;
  }> {
    try {
      return await createMember(
        this.prisma,
        {
          displayName: member.displayName,
          email: member.email,
          roleKey: member.roleKey,
          organizationalUnitId: group.organizationalUnitId,
          actorUserId,
          actorIsSuperAdmin: true,
          requestId: null,
        },
        {
          settingsService: this.settingsService,
          mailTransport: this.mailTransport,
          hibpChecker: this.hibpChecker,
        },
      );
    } catch (error) {
      if (error instanceof UsersError && error.code === 'EMAIL_CONFLICT') {
        throw new InstallTeamError(installTeamErrorCodes.emailConflict);
      }
      throw error;
    }
  }

  private async joinGroup(groupId: string, userId: string, actorUserId: string): Promise<void> {
    try {
      await addGroupMember(this.prisma, groupId, userId, async () => {}, {
        actorUserId,
        requestId: null,
      });
    } catch (error) {
      // A repeated seed already added the founder; an invited person may be a
      // member of the handler group already (e.g. a second save). Membership is
      // the goal, not the insert.
      if (error instanceof GroupsError && error.code === 'MEMBER_ALREADY_EXISTS') {
        return;
      }
      throw error;
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallTeamError(error);
    }
  }
}
