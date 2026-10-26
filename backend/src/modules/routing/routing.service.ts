import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import { listChangeLogPage } from '../change-log/list-change-logs';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { assertRoutingRuleScope } from './assert-routing-rule-scope';
import { computeRoutingCoverage } from './compute-routing-coverage';
import {
  computeRoutingRuleDeleteImpact,
  deleteRoutingRule,
  type RoutingRuleDeleteImpact,
} from './delete-routing-rule';
import { listRoutingHandlerGroups } from './list-routing-handler-groups';
import {
  listRoutingRules,
  loadVisibleRoutingRuleIds,
  resolveRoutingScopePairs,
} from './list-routing-rules';
import {
  assertOrWarnActivationRoutingCoverage,
  evaluateServiceRoutingCoverage,
} from './evaluate-service-routing-coverage';
import { mapRoutingError } from './map-routing-error';
import { persistRoutingRuleChange } from './persist-routing-rule-change';
import { resolveTicketRouting } from './resolve-ticket-routing';
import {
  hasRoutingReadAccess,
  isRoutingTargetGroupEligible,
  resolveRoutingReadAssignments,
} from './routing-access-filter';
import {
  routingCoverageMissingCode,
  routingListDefaultTake,
  routingListMaximumTake,
} from './routing.constants';
import {
  decodeRoutingChangeCursor,
  encodeRoutingListCursor,
} from './routing-list-cursor';
import { RoutingError } from './routing.error';
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
  RoutingListQuery,
  RoutingChangeLogPage,
  RoutingCoveragePage,
  RoutingCoverageQuery,
  RoutingHandlerGroupResponse,
  RoutingMutationContext,
  RoutingResolution,
  RoutingRulePage,
  RoutingRuleResponse,
  UpdateRoutingRuleInput,
} from './routing.types';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: RoutingConfigurationLoader,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
  ) {}

  async createRule(
    input: CreateRoutingRuleInput,
    context: RoutingMutationContext = { actorUserId: null },
  ): Promise<RoutingRuleResponse> {
    return this.execute(async () => {
      await this.assertTargetGroupEligible(
        input.groupId,
        input.serviceId,
        context.actorUserId,
      );
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
      await this.assertTargetGroupEligible(
        input.groupId,
        input.serviceId,
        context.actorUserId,
      );
      const updated = await updateRoutingRule(
        this.prisma,
        ruleId,
        {
          groupId: input.groupId,
          reason: input.reason,
          expectedUpdatedAt: input.expectedUpdatedAt,
        },
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

  async deleteImpact(
    ruleId: string,
    viewer: AuthorizationContext | null,
  ): Promise<RoutingRuleDeleteImpact> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      const visibleIds = await loadVisibleRoutingRuleIds(
        this.prisma,
        resolveRoutingReadAssignments(viewer),
      );
      if (visibleIds !== null && !visibleIds.includes(ruleId)) {
        throw new RoutingError('RULE_NOT_FOUND');
      }
      return computeRoutingRuleDeleteImpact(
        this.prisma,
        ruleId,
        await this.configurationLoader.load(),
      );
    });
  }

  async listRuleChanges(
    ruleId: string,
    query: RoutingListQuery,
    viewer: AuthorizationContext | null,
  ): Promise<RoutingChangeLogPage> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      const scopePairs = await resolveRoutingScopePairs(
        this.prisma,
        resolveRoutingReadAssignments(viewer),
      );
      const page = await this.listChangeLogPage(
        query,
        ruleId,
        scopePairs ?? undefined,
      );
      if (scopePairs !== null && page.total === 0) {
        throw new ForbiddenException('ROUTING_READ_FORBIDDEN');
      }
      return page;
    });
  }

  async listChanges(
    query: RoutingListQuery,
    viewer: AuthorizationContext | null,
  ): Promise<RoutingChangeLogPage> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      const scopePairs = await resolveRoutingScopePairs(
        this.prisma,
        resolveRoutingReadAssignments(viewer),
      );
      return this.listChangeLogPage(query, undefined, scopePairs ?? undefined);
    });
  }

  async listHandlerGroups(
    viewer: AuthorizationContext | null,
  ): Promise<readonly RoutingHandlerGroupResponse[]> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      return listRoutingHandlerGroups(this.prisma, viewer);
    });
  }

  async listRules(
    query: ListRoutingRulesQuery,
    viewer: AuthorizationContext | null,
  ): Promise<RoutingRulePage> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      const page = await listRoutingRules(
        this.prisma,
        query,
        resolveRoutingReadAssignments(viewer),
      );
      return {
        ...page,
        items: await toRoutingRuleResponses(this.prisma, page.items),
      };
    });
  }

  async resolveUnroutedTargetGroupId(): Promise<string | null> {
    const groupId = await this.configurationLoader.loadUnroutedTargetGroupId();
    if (groupId === null) {
      return null;
    }
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    return group?.id ?? null;
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
    viewer: AuthorizationContext | null,
  ): Promise<RoutingCoveragePage> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      const startedAt = Date.now();
      const page = await computeRoutingCoverage(
        this.prisma,
        query,
        await this.configurationLoader.load(),
        resolveRoutingReadAssignments(viewer),
      );
      this.logger.log({
        event: 'routing.coverage.completed',
        durationMs: Date.now() - startedAt,
        itemCount: page.resourceBudget.itemCount,
        estimatedBytes: page.resourceBudget.estimatedBytes,
        budgetLimited: page.resourceBudget.limited,
      });
      return page;
    });
  }

  async loadViewerContext(subjectId: string | null): Promise<AuthorizationContext | null> {
    if (subjectId === null) {
      return null;
    }
    return this.authorizationContextLoader.loadBySubjectId(subjectId);
  }

  hasRulesForService(serviceId: string): Promise<boolean> {
    return hasRoutingRulesForService(this.prisma, serviceId);
  }

  async evaluateActivationCoverage(
    serviceId: string,
  ): Promise<typeof routingCoverageMissingCode | null> {
    return assertOrWarnActivationRoutingCoverage(
      await evaluateServiceRoutingCoverage(
        this.prisma,
        serviceId,
        await this.configurationLoader.load(),
      ),
    );
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

  private async assertTargetGroupEligible(
    groupId: string,
    serviceId: string,
    actorUserId: string | null,
  ): Promise<void> {
    // Null actors are reserved for trusted internal callers and existing test harnesses.
    if (actorUserId === null) {
      return;
    }
    const [group, viewer] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: { organizationalUnit: { select: { ouPath: true } } },
      }),
      this.authorizationContextLoader.loadBySubjectId(actorUserId),
    ]);
    if (group === null) {
      throw new RoutingError('GROUP_NOT_FOUND');
    }
    if (
      !isRoutingTargetGroupEligible(
        group.organizationalUnit.ouPath,
        serviceId,
        viewer,
      )
    ) {
      throw new ForbiddenException('ROUTING_TARGET_GROUP_FORBIDDEN');
    }
  }

  private async listChangeLogPage(
    query: RoutingListQuery,
    entityId?: string,
    scopePairs?: readonly {
      readonly originUnitId: string;
      readonly serviceId: string | null;
    }[],
  ): Promise<RoutingChangeLogPage> {
    const take = Math.min(
      routingListMaximumTake,
      Math.max(1, query.take ?? routingListDefaultTake),
    );
    const cursor = decodeRoutingChangeCursor(query.cursor);
    const page = await listChangeLogPage(this.prisma, {
      entityType: changeLogEntityTypes.routingRule,
      entityId,
      scopePairs,
      take,
      ...(cursor === null
        ? {}
        : { cursor: { createdAt: new Date(cursor.createdAt), id: cursor.id } }),
    });
    const last = page.items[page.items.length - 1];
    return {
      ...page,
      take,
      cursor: query.cursor ?? null,
      nextCursor: page.hasMore && last !== undefined
        ? encodeRoutingListCursor({
            kind: 'change',
            createdAt: last.createdAt,
            id: last.id,
          })
        : null,
    };
  }

  private ensureReadAccess(context: AuthorizationContext | null): void {
    if (!hasRoutingReadAccess(context)) {
      throw new ForbiddenException('ROUTING_READ_FORBIDDEN');
    }
  }

  private async execute<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      throw mapRoutingError(error);
    }
  }
}
