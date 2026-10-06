import { Injectable, Optional } from '@nestjs/common';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { TicketAssignmentConfigurationLoader } from '../tickets/assignment/ticket-assignment-configuration.loader';
import { addGroupMember } from './add-group-member';
import { createGroup } from './create-group';
import { deleteGroup } from './delete-group';
import { getGroup } from './get-group';
import { mapGroupsError } from './map-groups-error';
import type {
  CreateGroupInput,
  GroupAuditContext,
  GroupListItemResponse,
  GroupResponse,
  ListGroupsQuery,
  MyGroupResponse,
  UpdateGroupInput,
} from './groups.types';
import { listGroups } from './list-groups';
import { listMyGroups } from './list-my-groups';
import { removeGroupMember } from './remove-group-member';
import { updateGroup } from './update-group';

const emptyAuditContext: GroupAuditContext = { actorUserId: null, requestId: null };

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketAssignmentConfigurationLoader,
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  private invalidatePrincipal(): (userId: string) => Promise<unknown> {
    return (userId) =>
      this.principalContextInvalidator?.invalidateUser(userId) ?? Promise.resolve(null);
  }

  list(query: ListGroupsQuery = {}): Promise<readonly GroupListItemResponse[]> {
    return this.execute(() => listGroups(this.prisma, query));
  }

  listMine(actorUserId: string): Promise<readonly MyGroupResponse[]> {
    return this.execute(() =>
      listMyGroups(
        this.prisma,
        this.authorizationContextLoader,
        this.configurationLoader,
        actorUserId,
      ),
    );
  }

  getById(groupId: string): Promise<GroupResponse> {
    return this.execute(() => getGroup(this.prisma, groupId));
  }

  create(
    input: CreateGroupInput,
    context: GroupAuditContext = emptyAuditContext,
  ): Promise<GroupResponse> {
    return this.execute(() => createGroup(this.prisma, input, context));
  }

  update(
    groupId: string,
    input: UpdateGroupInput,
    context: GroupAuditContext = emptyAuditContext,
  ): Promise<GroupResponse> {
    return this.execute(() => updateGroup(this.prisma, groupId, input, context));
  }

  async delete(
    groupId: string,
    context: GroupAuditContext = emptyAuditContext,
  ): Promise<void> {
    const outcome = await this.execute(() => deleteGroup(this.prisma, groupId, context));
    await this.invalidateUsers(outcome.affectedUserIds);
  }

  addMember(
    groupId: string,
    userId: string,
    context: GroupAuditContext = emptyAuditContext,
  ): Promise<GroupResponse> {
    return this.execute(() =>
      addGroupMember(this.prisma, groupId, userId, this.invalidatePrincipal(), context),
    );
  }

  removeMember(
    groupId: string,
    userId: string,
    context: GroupAuditContext = emptyAuditContext,
  ): Promise<GroupResponse> {
    return this.execute(() =>
      removeGroupMember(this.prisma, groupId, userId, this.invalidatePrincipal(), context),
    );
  }

  private async invalidateUsers(userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.principalContextInvalidator?.invalidateUsers(userIds);
    } catch {
      // The committed membership deletion is authoritative even if cache invalidation fails.
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapGroupsError(error);
    }
  }
}
