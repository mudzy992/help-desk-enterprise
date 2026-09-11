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
  SlaRuleResponse,
  SlaTargetsResponse,
  UpdateRuleInput,
} from './sla.types';

@Injectable()
export class SlaRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: SlaConfigurationLoader,
  ) {}

  list(slaProfileId?: string): Promise<readonly SlaRuleResponse[]> {
    return executeSlaOperation(async () =>
      toSlaRuleResponses(this.prisma, await listSlaRules(this.prisma, slaProfileId)),
    );
  }

  get(ruleId: string): Promise<SlaRuleResponse> {
    return executeSlaOperation(async () => {
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

  listChanges(ruleId: string): Promise<readonly SlaChangeLogResponse[]> {
    return executeSlaOperation(() =>
      listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.rule,
        entityId: ruleId,
      }),
    );
  }

  resolveTargets(input: ResolveSlaTargetsInput): Promise<SlaTargetsResponse> {
    return executeSlaOperation(() => computeSlaTargets(this.prisma, input));
  }
}
