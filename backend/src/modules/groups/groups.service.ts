import { Injectable, Optional } from '@nestjs/common';
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
  GroupListItemResponse,
  GroupResponse,
  ListGroupsQuery,
  MyGroupResponse,
  UpdateGroupInput,
} from './groups.types';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { listGroups } from './list-groups';
import { listMyGroups } from './list-my-groups';
import { removeGroupMember } from './remove-group-member';
import { updateGroup } from './update-group';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketAssignmentConfigurationLoader,
    // Phase 2.2: optional so direct construction in tests keeps working; the
    // module always provides it.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  /** Phase 2.2: the member's cached authorization data is dropped on change. */
  private invalidatePrincipal(): (userId: string) => Promise<unknown> {
    return (userId) =>
      this.principalContextInvalidator?.invalidateUser(userId) ??
      Promise.resolve(null);
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

  create(input: CreateGroupInput): Promise<GroupResponse> {
    return this.execute(() => createGroup(this.prisma, input));
  }

  update(groupId: string, input: UpdateGroupInput): Promise<GroupResponse> {
    return this.execute(() => updateGroup(this.prisma, groupId, input));
  }

  async delete(groupId: string): Promise<void> {
    await this.execute(() => deleteGroup(this.prisma, groupId));
  }

  addMember(groupId: string, userId: string): Promise<GroupResponse> {
    return this.execute(() =>
      addGroupMember(this.prisma, groupId, userId, this.invalidatePrincipal()),
    );
  }

  removeMember(groupId: string, userId: string): Promise<GroupResponse> {
    return this.execute(() =>
      removeGroupMember(this.prisma, groupId, userId, this.invalidatePrincipal()),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapGroupsError(error);
    }
  }
}
