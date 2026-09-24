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
import { updateOrganizationalUnit } from './update-organizational-unit';

@Injectable()
export class OrganizationalUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    // Phase 2.2: optional so direct construction in tests keeps working; the
    // module always provides it.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  async create(
    input: CreateOrganizationalUnitInput,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(() => createOrganizationalUnit(this.prisma, input));
  }

  async getById(
    organizationalUnitId: string,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(() => getOrganizationalUnit(this.prisma, organizationalUnitId));
  }

  async getTree(): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
    return this.execute(() => getOrganizationalUnitTree(this.prisma));
  }

  async update(
    organizationalUnitId: string,
    input: UpdateOrganizationalUnitInput,
  ): Promise<OrganizationalUnitDetailResponse> {
    return this.execute(() =>
      updateOrganizationalUnit(this.prisma, organizationalUnitId, input),
    );
  }

  async delete(organizationalUnitId: string): Promise<void> {
    await this.execute(() => deleteOrganizationalUnit(this.prisma, organizationalUnitId));
  }

  async listUsers(
    organizationalUnitId: string,
  ): Promise<readonly OrganizationalUnitUserResponse[]> {
    return this.execute(() =>
      listOrganizationalUnitUsers(this.prisma, organizationalUnitId),
    );
  }

  async assignUser(
    input: AssignUserOrganizationalUnitInput,
  ): Promise<OrganizationalUnitUserResponse> {
    return this.execute(async () => {
      const response = await assignUserOrganizationalUnit(this.prisma, input);
      // Phase 2.2: the unit is part of the principal context, so the assignment
      // invalidates the cached copy of that user right away.
      await this.principalContextInvalidator?.invalidateUser(input.userId);
      return response;
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapOrganizationalUnitError(error);
    }
  }
}
