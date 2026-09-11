import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseConfigurationReference } from './parse-configuration-reference';
import type {
  ConfigurationReferenceValidation,
  ServiceOnboardingSlaProvider,
} from './service-onboarding.types';

@Injectable()
export class DefaultOnboardingSlaProvider implements ServiceOnboardingSlaProvider {
  constructor(private readonly prisma: PrismaService) {}

  async validate(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<ConfigurationReferenceValidation> {
    const reference = parseConfigurationReference(
      input.reference,
      'INVALID_SLA_CONFIGURATION_REF',
    );
    const profile = await this.prisma.slaProfile.findUnique({
      where: { id: reference },
      select: { id: true, isActive: true },
    });
    return {
      reference,
      resolvedEntityId: profile?.isActive ? profile.id : null,
    };
  }
}
