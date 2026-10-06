import { Injectable, Optional } from '@nestjs/common';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OrganizationalUnitDeleteResponse } from '../organizational-units/organizational-unit-delete.types';
import { OrganizationalUnitError } from '../organizational-units/organizational-unit.error';
import { mapOrganizationalUnitError } from '../organizational-units/map-organizational-unit-error';
import { createManualDirectoryOrganizationalUnit } from './create-manual-directory-organizational-unit';
import { deleteManualDirectoryOrganizationalUnit } from './delete-manual-directory-organizational-unit';
import { DirectoryReadCache } from './directory-read.cache';
import { listManualDirectoryOrganizationalUnits } from './list-manual-directory-organizational-units';
import { mapManualDirectoryCatalogError } from './map-manual-directory-catalog-error';
import type {
  CreateManualDirectoryOrganizationalUnitInput,
  ManualDirectoryCatalogAuditContext,
  ManualDirectoryOrganizationalUnitResponse,
  UpdateManualDirectoryOrganizationalUnitInput,
} from './manual-directory-catalog.types';
import { updateManualDirectoryOrganizationalUnit } from './update-manual-directory-organizational-unit';

const emptyAuditContext: ManualDirectoryCatalogAuditContext = {
  actorUserId: null,
  requestId: null,
};

@Injectable()
export class ManualDirectoryCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directoryReadCache: DirectoryReadCache,
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  listOrganizationalUnits(): Promise<readonly ManualDirectoryOrganizationalUnitResponse[]> {
    return this.execute(() => listManualDirectoryOrganizationalUnits(this.prisma));
  }

  createOrganizationalUnit(
    input: CreateManualDirectoryOrganizationalUnitInput,
    context: ManualDirectoryCatalogAuditContext = emptyAuditContext,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.execute(async () => {
      const created = await createManualDirectoryOrganizationalUnit(this.prisma, input, context);
      this.directoryReadCache.clear();
      return created;
    });
  }

  updateOrganizationalUnit(
    externalId: string,
    input: UpdateManualDirectoryOrganizationalUnitInput,
    context: ManualDirectoryCatalogAuditContext = emptyAuditContext,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.execute(async () => {
      const updated = await updateManualDirectoryOrganizationalUnit(
        this.prisma,
        externalId,
        input,
        context,
      );
      this.directoryReadCache.clear();
      return updated;
    });
  }

  async deleteOrganizationalUnit(
    externalId: string,
    context: ManualDirectoryCatalogAuditContext = emptyAuditContext,
  ): Promise<OrganizationalUnitDeleteResponse> {
    const outcome = await this.execute(() =>
      deleteManualDirectoryOrganizationalUnit(this.prisma, externalId, context),
    );
    this.directoryReadCache.clear();
    await this.invalidateUsers(outcome.affectedUserIds);
    return { warnings: outcome.warnings };
  }

  private async invalidateUsers(userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    try {
      await this.principalContextInvalidator?.invalidateUsers(userIds);
    } catch {
      // Cache invalidation is best effort; a committed deletion must remain committed.
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OrganizationalUnitError) {
        throw mapOrganizationalUnitError(error);
      }
      mapManualDirectoryCatalogError(error);
    }
  }
}
