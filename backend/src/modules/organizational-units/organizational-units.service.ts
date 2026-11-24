import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../authorization/evaluate-authorization-access';
import { assertActorManagesOrganizationalUnit } from './assert-organizational-unit-manage-scope';
import { assignUserOrganizationalUnit } from './assign-user-organizational-unit';
import { createOrganizationalUnit } from './create-organizational-unit';
import { deleteOrganizationalUnit } from './delete-organizational-unit';
import { getOrganizationalUnit } from './get-organizational-unit';
import { getOrganizationalUnitTree } from './get-organizational-unit-tree';
import { listOrganizationalUnitUsers } from './list-organizational-unit-users';
import { mapOrganizationalUnitError } from './map-organizational-unit-error';
import type {
  AssignUserOrganizationalUnitInput,
  CreateOrganizationalUnitInput,
  OrganizationalUnitDetailResponse,
  OrganizationalUnitTreeNodeResponse,
  OrganizationalUnitUserResponse,
  UpdateOrganizationalUnitInput,
} from './organizational-unit.types';
import type {
  OrganizationalUnitAuditContext,
  OrganizationalUnitDeleteResponse,
} from './organizational-unit-delete.types';
import { updateOrganizationalUnit } from './update-organizational-unit';

const emptyAuditContext: OrganizationalUnitAuditContext = {
  actorUserId: null,
  requestId: null,
};

@Injectable()
export class OrganizationalUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  create(
    input: CreateOrganizationalUnitInput,
    context: OrganizationalUnitAuditContext = emptyAuditContext,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(() => createOrganizationalUnit(this.prisma, input, context));
  }

  getById(organizationalUnitId: string): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(() => getOrganizationalUnit(this.prisma, organizationalUnitId));
  }

  /**
   * W2.9 (`BA-organizational-units-01`): a caller that holds the manage
   * permission sees only the units that permission covers. Callers without it
   * (USER, AGENT, service accounts) keep the unfiltered tree they use for
   * filters — their access to the underlying data is decided elsewhere.
   */
  getTree(actorUserId: string | null = null): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
    return this.execute(async () =>
      getOrganizationalUnitTree(this.prisma, await this.resolveTreeVisibility(actorUserId)),
    );
  }

  update(
    organizationalUnitId: string,
    input: UpdateOrganizationalUnitInput,
    context: OrganizationalUnitAuditContext = emptyAuditContext,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(async () => {
      await this.assertDestinationParentScope(input, context);
      return updateOrganizationalUnit(
        this.prisma,
        organizationalUnitId,
        input,
        context,
        (userIds) => this.invalidateUsers(userIds),
      );
    });
  }

  async delete(
    organizationalUnitId: string,
    context: OrganizationalUnitAuditContext = emptyAuditContext,
  ): Promise<OrganizationalUnitDeleteResponse> {
    const result = await this.execute(() =>
      deleteOrganizationalUnit(this.prisma, organizationalUnitId, context),
    );
    await this.invalidateUsers(result.affectedUserIds);
    return { warnings: result.warnings };
  }

  listUsers(
    organizationalUnitId: string,
  ): Promise<readonly OrganizationalUnitUserResponse[]> {
    return this.execute(() =>
      listOrganizationalUnitUsers(this.prisma, organizationalUnitId),
    );
  }

  async assignUser(
    input: AssignUserOrganizationalUnitInput,
    context: OrganizationalUnitAuditContext = emptyAuditContext,
  ): Promise<OrganizationalUnitUserResponse> {
    return this.execute(async () => {
      await this.assertUserMappingScope(input, context);
      const response = await assignUserOrganizationalUnit(this.prisma, input, context);
      await this.invalidateUsers([input.userId]);
      return response;
    });
  }

  /**
   * The guard decides the unit named in the body. A user being pulled out of a
   * unit the actor does not manage must be refused here as well, otherwise a
   * scoped admin could empty a foreign unit one user at a time.
   */
  private async assertUserMappingScope(
    input: AssignUserOrganizationalUnitInput,
    context: OrganizationalUnitAuditContext,
  ): Promise<void> {
    // The destination is already decided by the guard; when it is absent the
    // operation only removes the mapping, so only the current unit matters.
    await assertActorManagesOrganizationalUnit({
      loader: this.authorizationContextLoader,
      prisma: this.prisma,
      actorUserId: context.actorUserId,
      organizationalUnitId: input.organizationalUnitId,
      allowNullTarget: true,
    });
    const current = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { organizationalUnitId: true },
    });
    await assertActorManagesOrganizationalUnit({
      loader: this.authorizationContextLoader,
      prisma: this.prisma,
      actorUserId: context.actorUserId,
      organizationalUnitId: current?.organizationalUnitId ?? null,
      allowNullTarget: true,
    });
  }

  /**
   * Moving a unit is two decisions: the unit itself (guard) and the new parent
   * (here). A null parent means "promote to root", which only a global grant may
   * do.
   */
  private async assertDestinationParentScope(
    input: UpdateOrganizationalUnitInput,
    context: OrganizationalUnitAuditContext,
  ): Promise<void> {
    if (input.parentId === undefined) {
      return;
    }
    await assertActorManagesOrganizationalUnit({
      loader: this.authorizationContextLoader,
      prisma: this.prisma,
      actorUserId: context.actorUserId,
      organizationalUnitId: input.parentId,
    });
  }

  private async resolveTreeVisibility(
    actorUserId: string | null,
  ): Promise<((record: { id: string; ouPath: string }) => boolean) | undefined> {
    if (actorUserId === null || actorUserId.trim().length === 0) {
      return undefined;
    }
    const context = await this.authorizationContextLoader.loadBySubjectId(actorUserId);
    if (context === null || context === undefined) {
      return undefined;
    }
    const managesOrganizationalUnits = context.assignments.some((assignment) =>
      assignment.permissionKeys.includes(permissionKeys.organizationalUnitManage),
    );
    if (!managesOrganizationalUnits) {
      return undefined;
    }
    return (record) =>
      decideAuthorizationAccess({
        context,
        requiredRoles: [],
        requiredPermissions: [permissionKeys.organizationalUnitManage],
        organizationalUnitId: record.id,
        organizationalUnitPath: record.ouPath,
        serviceId: null,
        requireOrganizationalUnitScope: true,
        requireServiceScope: false,
      }).allowed;
  }

  private async invalidateUsers(userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.principalContextInvalidator?.invalidateUsers(userIds);
    } catch {
      // Cache invalidation is best effort; it must not roll back a committed mutation.
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapOrganizationalUnitError(error);
    }
  }
}
