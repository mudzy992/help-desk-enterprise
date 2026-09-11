import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createSlaProfile } from './create-sla-profile';
import { deleteSlaProfile } from './delete-sla-profile';
import { executeSlaOperation } from './execute-sla-operation';
import { listSlaChangeLogs } from './list-sla-change-logs';
import { listSlaProfiles, toSlaProfileResponses } from './list-sla-profiles';
import { requireSlaProfile } from './load-sla-profile';
import { slaChangeLogEntityTypes } from './sla.constants';
import { updateSlaProfile } from './update-sla-profile';
import type {
  ProfileWriteInput,
  SlaChangeLogResponse,
  SlaMutationContext,
  SlaProfileResponse,
  UpdateProfileInput,
} from './sla.types';

@Injectable()
export class SlaProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<readonly SlaProfileResponse[]> {
    return executeSlaOperation(async () =>
      toSlaProfileResponses(this.prisma, await listSlaProfiles(this.prisma)),
    );
  }

  get(profileId: string): Promise<SlaProfileResponse> {
    return executeSlaOperation(async () => {
      const [response] = await toSlaProfileResponses(this.prisma, [
        await requireSlaProfile(this.prisma, profileId),
      ]);
      return response as SlaProfileResponse;
    });
  }

  create(
    input: ProfileWriteInput,
    context: SlaMutationContext,
  ): Promise<SlaProfileResponse> {
    return executeSlaOperation(async () => {
      const created = await createSlaProfile(this.prisma, input, context);
      const [response] = await toSlaProfileResponses(this.prisma, [created]);
      return response as SlaProfileResponse;
    });
  }

  update(
    profileId: string,
    input: UpdateProfileInput,
    context: SlaMutationContext,
  ): Promise<SlaProfileResponse> {
    return executeSlaOperation(async () => {
      const updated = await updateSlaProfile(
        this.prisma,
        profileId,
        input,
        context,
      );
      const [response] = await toSlaProfileResponses(this.prisma, [updated]);
      return response as SlaProfileResponse;
    });
  }

  delete(
    profileId: string,
    reason: string,
    context: SlaMutationContext,
  ): Promise<void> {
    return executeSlaOperation(() =>
      deleteSlaProfile(this.prisma, profileId, reason, context),
    );
  }

  listChanges(profileId: string): Promise<readonly SlaChangeLogResponse[]> {
    return executeSlaOperation(() =>
      listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.profile,
        entityId: profileId,
      }),
    );
  }
}
