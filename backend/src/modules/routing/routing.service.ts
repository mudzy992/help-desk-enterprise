import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildRoutingConfigurationReference,
  isRoutingConfigurationReferenceForService,
} from './build-routing-configuration-reference';
import { computeRoutingCoverage } from './compute-routing-coverage';
import { listRoutingHandlerGroups } from './list-routing-handler-groups';
import { listRoutingRules } from './list-routing-rules';
import { mapRoutingError } from './map-routing-error';
import { persistRoutingRuleChange } from './persist-routing-rule-change';
import { resolveTicketRouting } from './resolve-ticket-routing';
import { RoutingConfigurationLoader } from './routing-configuration.loader';
import { toRoutingRuleResponses } from './to-routing-rule-response';
import type {
  CreateRoutingRuleInput,
  ListRoutingRulesQuery,
  ResolveRoutingInput,
  RoutingCoverageItem,
  RoutingCoverageQuery,
  RoutingHandlerGroupResponse,
  RoutingMutationContext,
  RoutingResolution,
  RoutingRuleResponse,
} from './routing.types';

@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: RoutingConfigurationLoader,
  ) {}

  async createRule(
    input: CreateRoutingRuleInput,
    context: RoutingMutationContext = { actorUserId: null },
  ): Promise<RoutingRuleResponse> {
    return this.execute(async () => {
      const created = await persistRoutingRuleChange(
        this.prisma,
        input,
        context,
        await this.configurationLoader.load(),
      );
      const [response] = await toRoutingRuleResponses(this.prisma, [created]);
      return response as RoutingRuleResponse;
    });
  }

  async listHandlerGroups(): Promise<readonly RoutingHandlerGroupResponse[]> {
    return this.execute(() => listRoutingHandlerGroups(this.prisma));
  }

  async listRules(
    query: ListRoutingRulesQuery,
  ): Promise<readonly RoutingRuleResponse[]> {
    return this.execute(async () => {
      const rules = await listRoutingRules(this.prisma, query);
      return toRoutingRuleResponses(this.prisma, rules);
    });
  }

  async resolve(input: ResolveRoutingInput): Promise<RoutingResolution> {
    return this.execute(async () =>
      resolveTicketRouting(
        this.prisma,
        input,
        await this.configurationLoader.load(),
      ),
    );
  }

  async coverage(
    query: RoutingCoverageQuery,
  ): Promise<readonly RoutingCoverageItem[]> {
    return this.execute(async () =>
      computeRoutingCoverage(
        this.prisma,
        query,
        await this.configurationLoader.load(),
      ),
    );
  }

  async hasRulesForService(serviceId: string): Promise<boolean> {
    const count = await this.prisma.routingRule.count({ where: { serviceId } });
    return count > 0;
  }

  async suggestOnboardingReference(serviceId: string): Promise<string | null> {
    return (await this.hasRulesForService(serviceId))
      ? buildRoutingConfigurationReference(serviceId)
      : null;
  }

  async acceptsOnboardingReference(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<boolean> {
    return (
      isRoutingConfigurationReferenceForService(
        input.reference,
        input.serviceId,
      ) && (await this.hasRulesForService(input.serviceId))
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapRoutingError(error);
    }
  }
}
