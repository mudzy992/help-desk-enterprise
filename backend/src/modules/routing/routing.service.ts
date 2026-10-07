import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import { listChangeLogs } from '../change-log/list-change-logs';
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
import { listRoutingRules } from './list-routing-rules';
import {
  assertOrWarnActivationRoutingCoverage,
  evaluateServiceRoutingCoverage,
} from './evaluate-service-routing-coverage';
import { mapRoutingError } from './map-routing-error';
import { persistRoutingRuleChange } from './persist-routing-rule-change';
import { resolveTicketRouting } from './resolve-ticket-routing';
import {
  filterRoutingChangeLogs,
  filterRoutingCoverage,
  filterRoutingRules,
  hasRoutingReadAccess,
  isRoutingScopeVisible,
  resolveRoutingReadAssignments,
} from './routing-access-filter';
import { routingCoverageMissingCode } from './routing.constants';
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
  RoutingChangeLogResponse,
  RoutingCoveragePage,
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
    private readonly authorizationContextLoader: AuthorizationContextLoader,
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

  async deleteImpact(
    ruleId: string,
    viewer: AuthorizationContext | null,
  ): Promise<RoutingRuleDeleteImpact> {
    return this.execute(async () => {
      const rules = await toRoutingRuleResponses(
        this.prisma,
        await listRoutingRules(this.prisma, {}),
      );
      const visible = this.ensureReadableRules(rules, viewer);
      if (!visible.some((rule) => rule.id === ruleId)) {
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
    viewer: AuthorizationContext | null,
  ): Promise<readonly RoutingChangeLogResponse[]> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      const [rules, logs] = await Promise.all([
        toRoutingRuleResponses(
          this.prisma,
          await listRoutingRules(this.prisma, {}),
        ),
        listChangeLogs(this.prisma, {
          entityType: changeLogEntityTypes.routingRule,
          entityId: ruleId,
        }),
      ]);
      const visible = filterRoutingRules(rules, viewer);
      // Allow global readers to read changelogs for deleted rules too.
      const assignments = resolveRoutingReadAssignments(viewer);
      const canRead =
        visible.some((rule) => rule.id === ruleId) ||
        (logs.length > 0 && isRoutingScopeVisible({ originUnitId: null, serviceId: null }, assignments));
      if (!canRead) {
        throw new ForbiddenException('ROUTING_READ_FORBIDDEN');
      }
      return logs;
    });
  }

  async listChanges(
    viewer: AuthorizationContext | null,
  ): Promise<readonly RoutingChangeLogResponse[]> {
    return this.execute(async () => {
      const [rules, logs] = await Promise.all([
        toRoutingRuleResponses(
          this.prisma,
          await listRoutingRules(this.prisma, {}),
        ),
        listChangeLogs(this.prisma, {
          entityType: changeLogEntityTypes.routingRule,
        }),
      ]);
      const visible = this.ensureReadableRules(rules, viewer);
      return filterRoutingChangeLogs(
        logs,
        viewer,
        new Set(visible.map((rule) => rule.id)),
      );
    });
  }

  async listHandlerGroups(
    viewer: AuthorizationContext | null,
  ): Promise<readonly RoutingHandlerGroupResponse[]> {
    return this.execute(async () => {
      this.ensureReadAccess(viewer);
      return listRoutingHandlerGroups(this.prisma);
    });
  }

  async listRules(
    query: ListRoutingRulesQuery,
    viewer: AuthorizationContext | null,
  ): Promise<readonly RoutingRuleResponse[]> {
    return this.execute(async () => {
      const rules = await toRoutingRuleResponses(
        this.prisma,
        await listRoutingRules(this.prisma, query),
      );
      return filterRoutingRules(rules, viewer);
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
      const page = await computeRoutingCoverage(
        this.prisma,
        query,
        await this.configurationLoader.load(),
      );
      const items = filterRoutingCoverage(page.items, viewer);
      // `total` counts distinct matching services (one item is emitted per
      // service × origin OU, so item count = services × OUs).
      const visibleServiceIds = new Set(items.map((item) => item.serviceId));
      return { ...page, items, total: visibleServiceIds.size };
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

  private ensureReadAccess(context: AuthorizationContext | null): void {
    if (!hasRoutingReadAccess(context)) {
      throw new ForbiddenException('ROUTING_READ_FORBIDDEN');
    }
  }

  private ensureReadableRules(
    rules: readonly RoutingRuleResponse[],
    context: AuthorizationContext | null,
  ): readonly RoutingRuleResponse[] {
    this.ensureReadAccess(context);
    return filterRoutingRules(rules, context);
  }

  private async execute<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      throw mapRoutingError(error);
    }
  }
}
