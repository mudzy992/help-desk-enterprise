import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import { listChangeLogs } from '../change-log/list-change-logs';
import { assertRoutingRuleScope } from './assert-routing-rule-scope';
import { computeRoutingCoverage } from './compute-routing-coverage';
import {
  computeRoutingRuleDeleteImpact,
  deleteRoutingRule,
  type RoutingRuleDeleteImpact,
} from './delete-routing-rule';
import { listRoutingHandlerGroups } from './list-routing-handler-groups';
import { listRoutingRules } from './list-routing-rules';
import { mapRoutingError } from './map-routing-error';
import { persistRoutingRuleChange } from './persist-routing-rule-change';
import { resolveTicketRouting } from './resolve-ticket-routing';
import {
  acceptsRoutingOnboardingReference,
  hasRoutingRulesForService,
  suggestRoutingOnboardingReference,
} from './routing-onboarding-support';
import { RoutingConfigurationLoader } from './routing-configuration.loader';
import { toRoutingRuleResponses } from './to-routing-rule-response';
import { updateRoutingRule } from './update-routing-rule';
import type {
  CreateRoutingRuleInput,
  ListRoutingRulesQuery,
  ResolveRoutingInput,
  RoutingChangeLogResponse,
  RoutingCoverageItem,
  RoutingCoverageQuery,
  RoutingHandlerGroupResponse,
  RoutingMutationContext,
  RoutingResolution,
  RoutingRuleResponse,
  UpdateRoutingRuleInput,
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

  async updateRule(
    ruleId: string,
    input: UpdateRoutingRuleInput & {
      readonly originUnitId: string;
      readonly serviceId: string;
    },
    context: RoutingMutationContext = { actorUserId: null },
  ): Promise<RoutingRuleResponse> {
    return this.execute(async () => {
      await assertRoutingRuleScope(
        this.prisma,
        ruleId,
        input.originUnitId,
        input.serviceId,
      );
      const updated = await updateRoutingRule(
        this.prisma,
        ruleId,
        { groupId: input.groupId, reason: input.reason },
        context,
        await this.configurationLoader.load(),
      );
      const [response] = await toRoutingRuleResponses(this.prisma, [updated]);
      return response as RoutingRuleResponse;
    });
  }

  async deleteRule(
    ruleId: string,
    input: {
      readonly originUnitId: string;
      readonly serviceId: string;
      readonly reason: string;
    },
    context: RoutingMutationContext = { actorUserId: null },
  ): Promise<RoutingRuleDeleteImpact> {
    return this.execute(async () => {
      await assertRoutingRuleScope(
        this.prisma,
        ruleId,
        input.originUnitId,
        input.serviceId,
      );
      return deleteRoutingRule(
        this.prisma,
        ruleId,
        input.reason,
        context,
        await this.configurationLoader.load(),
      );
    });
  }

  async deleteImpact(ruleId: string): Promise<RoutingRuleDeleteImpact> {
    return this.execute(async () =>
      computeRoutingRuleDeleteImpact(
        this.prisma,
        ruleId,
        await this.configurationLoader.load(),
      ),
    );
  }

  async listRuleChanges(ruleId: string): Promise<readonly RoutingChangeLogResponse[]> {
    return this.execute(() =>
      listChangeLogs(this.prisma, {
        entityType: changeLogEntityTypes.routingRule,
        entityId: ruleId,
      }),
    );
  }

  async listChanges(): Promise<readonly RoutingChangeLogResponse[]> {
    return this.execute(() =>
      listChangeLogs(this.prisma, {
        entityType: changeLogEntityTypes.routingRule,
      }),
    );
  }

  async listHandlerGroups(): Promise<readonly RoutingHandlerGroupResponse[]> {
    return this.execute(() => listRoutingHandlerGroups(this.prisma));
  }

  async listRules(query: ListRoutingRulesQuery): Promise<readonly RoutingRuleResponse[]> {
    return this.execute(async () =>
      toRoutingRuleResponses(this.prisma, await listRoutingRules(this.prisma, query)),
    );
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

  hasRulesForService(serviceId: string): Promise<boolean> {
    return hasRoutingRulesForService(this.prisma, serviceId);
  }

  suggestOnboardingReference(serviceId: string): Promise<string | null> {
    return suggestRoutingOnboardingReference(this.prisma, serviceId);
  }

  acceptsOnboardingReference(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<boolean> {
    return acceptsRoutingOnboardingReference(this.prisma, input);
  }

  private async execute<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      throw mapRoutingError(error);
    }
  }
}
