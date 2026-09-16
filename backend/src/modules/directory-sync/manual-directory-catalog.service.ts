import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createManualDirectoryOrganizationalUnit } from './create-manual-directory-organizational-unit';
import { deleteManualDirectoryOrganizationalUnit } from './delete-manual-directory-organizational-unit';
import { DirectoryReadCache } from './directory-read.cache';
import { listManualDirectoryOrganizationalUnits } from './list-manual-directory-organizational-units';
import { mapManualDirectoryCatalogError } from './map-manual-directory-catalog-error';
import type {
  CreateManualDirectoryOrganizationalUnitInput,
  ManualDirectoryOrganizationalUnitResponse,
  UpdateManualDirectoryOrganizationalUnitInput,
} from './manual-directory-catalog.types';
import { updateManualDirectoryOrganizationalUnit } from './update-manual-directory-organizational-unit';

@Injectable()
export class ManualDirectoryCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directoryReadCache: DirectoryReadCache,
  ) {}

  listOrganizationalUnits(): Promise<
    readonly ManualDirectoryOrganizationalUnitResponse[]
  > {
    return this.execute(() => listManualDirectoryOrganizationalUnits(this.prisma));
  }

  createOrganizationalUnit(
    input: CreateManualDirectoryOrganizationalUnitInput,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.execute(async () => {
      const created = await createManualDirectoryOrganizationalUnit(
        this.prisma,
        input,
      );
      this.directoryReadCache.clear();
      return created;
    });
  }

  updateOrganizationalUnit(
    externalId: string,
    input: UpdateManualDirectoryOrganizationalUnitInput,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.execute(async () => {
      const updated = await updateManualDirectoryOrganizationalUnit(
        this.prisma,
        externalId,
        input,
      );
      this.directoryReadCache.clear();
      return updated;
    });
  }

  deleteOrganizationalUnit(externalId: string): Promise<void> {
    return this.execute(async () => {
      await deleteManualDirectoryOrganizationalUnit(this.prisma, externalId);
      this.directoryReadCache.clear();
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      mapManualDirectoryCatalogError(error);
    }
  }
}
