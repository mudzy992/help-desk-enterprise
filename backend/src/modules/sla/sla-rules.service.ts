import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeSlaTargets } from './compute-sla-targets';
import { createSlaRule } from './create-sla-rule';
import { deleteSlaRule } from './delete-sla-rule';
import { executeSlaOperation } from './execute-sla-operation';
import { listSlaChangeLogs } from './list-sla-change-logs';
import { listSlaRules, toSlaRuleResponses } from './list-sla-rules';
import { requireSlaRule } from './load-sla-rule';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { updateSlaRule } from './update-sla-rule';
import type {
  ResolveSlaTargetsInput,
  RuleWriteInput,
  SlaChangeLogResponse,
  SlaMutationContext,
  SlaPage,
  SlaRuleResponse,
  SlaTargetsResponse,
  UpdateRuleInput,
} from './sla.types';
import type { SlaReadScope } from './sla-read-scope';
import { requireSlaRuleReadScope } from './require-sla-read-scope';

@Injectable()
export class SlaRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: SlaConfigurationLoader,
  ) {}

  list(slaProfileId?: string, input?: { readonly scope?: SlaReadScope; readonly cursor?: string; readonly take?: number }): Promise<SlaPage<SlaRuleResponse>> {
    return executeSlaOperation(async () => {
      const page = await listSlaRules(this.prisma, slaProfileId, input);
      return { ...page, items: await toSlaRuleResponses(this.prisma, page.items) };
    });
  }

  get(ruleId: string, scope?: SlaReadScope): Promise<SlaRuleResponse> {
    return executeSlaOperation(async () => {
      if (scope !== undefined) await requireSlaRuleReadScope(this.prisma, ruleId, scope);
      const [response] = await toSlaRuleResponses(this.prisma, [
        await requireSlaRule(this.prisma, ruleId),
      ]);
      return response as SlaRuleResponse;
    });
  }

  create(
    input: RuleWriteInput,
    context: SlaMutationContext,
  ): Promise<SlaRuleResponse> {
    return executeSlaOperation(async () => {
      const created = await createSlaRule(
        this.prisma,
        input,
        context,
        await this.configurationLoader.load(),
      );
      const [response] = await toSlaRuleResponses(this.prisma, [created]);
      return response as SlaRuleResponse;
    });
  }

  update(
    ruleId: string,
    input: UpdateRuleInput,
    context: SlaMutationContext,
  ): Promise<SlaRuleResponse> {
    return executeSlaOperation(async () => {
      const updated = await updateSlaRule(
        this.prisma,
        ruleId,
        input,
        context,
        await this.configurationLoader.load(),
      );
      const [response] = await toSlaRuleResponses(this.prisma, [updated]);
      return response as SlaRuleResponse;
    });
  }

  delete(
    ruleId: string,
    reason: string,
    context: SlaMutationContext,
  ): Promise<void> {
    return executeSlaOperation(() =>
      deleteSlaRule(this.prisma, ruleId, reason, context),
    );
  }

  listChanges(ruleId: string, input: { readonly scope: SlaReadScope; readonly cursor?: string; readonly take?: number }): Promise<SlaPage<SlaChangeLogResponse>> {
    return executeSlaOperation(async () => {
      await requireSlaRuleReadScope(this.prisma, ruleId, input.scope);
      return listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.rule,
        entityId: ruleId,
        cursor: input.cursor,
        take: input.take,
      });
    });
  }

  resolveTargets(input: ResolveSlaTargetsInput): Promise<SlaTargetsResponse> {
    return executeSlaOperation(() => computeSlaTargets(this.prisma, input));
  }
}
