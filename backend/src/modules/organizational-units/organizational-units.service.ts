import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
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

  getTree(): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
    return this.execute(() => getOrganizationalUnitTree(this.prisma));
  }

  update(
    organizationalUnitId: string,
    input: UpdateOrganizationalUnitInput,
    context: OrganizationalUnitAuditContext = emptyAuditContext,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(() =>
      updateOrganizationalUnit(this.prisma, organizationalUnitId, input, context),
    );
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
      const response = await assignUserOrganizationalUnit(this.prisma, input, context);
      await this.invalidateUsers([input.userId]);
      return response;
    });
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
