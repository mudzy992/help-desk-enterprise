import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createSlaEscalationRule } from './create-sla-escalation-rule';
import { deleteSlaEscalationRule } from './delete-sla-escalation-rule';
import { executeSlaOperation } from './execute-sla-operation';
import { listSlaChangeLogs } from './list-sla-change-logs';
import {
  listSlaEscalationRules,
  toSlaEscalationRuleResponses,
} from './list-sla-escalation-rules';
import { requireSlaEscalationRule } from './load-sla-escalation-rule';
import { slaChangeLogEntityTypes } from './sla.constants';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { SlaError } from './sla.error';
import { updateSlaEscalationRule } from './update-sla-escalation-rule';
import type {
  EscalationRuleWriteInput,
  SlaChangeLogResponse,
  SlaEscalationRuleResponse,
  SlaMutationContext,
  UpdateEscalationRuleInput,
} from './sla.types';

@Injectable()
export class SlaEscalationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: SlaConfigurationLoader,
  ) {}

  list(slaProfileId: string): Promise<readonly SlaEscalationRuleResponse[]> {
    return executeSlaOperation(async () =>
      toSlaEscalationRuleResponses(
        await listSlaEscalationRules(this.prisma, slaProfileId),
      ),
    );
  }

  get(ruleId: string): Promise<SlaEscalationRuleResponse> {
    return executeSlaOperation(async () => {
      const rule = await requireSlaEscalationRule(this.prisma, ruleId);
      const response = toSlaEscalationRuleResponses(
        await listSlaEscalationRules(this.prisma, rule.slaProfileId),
      ).find((item) => item.id === ruleId);
      if (response === undefined) {
        throw new SlaError('ESCALATION_RULE_NOT_FOUND');
      }
      return response;
    });
  }

  create(
    input: EscalationRuleWriteInput,
    context: SlaMutationContext,
  ): Promise<SlaEscalationRuleResponse> {
    return executeSlaOperation(async () => {
      const created = await createSlaEscalationRule(
        this.prisma,
        input,
        context,
        await this.configurationLoader.load(),
      );
      return this.get(created.id);
    });
  }

  update(
    ruleId: string,
    input: UpdateEscalationRuleInput,
    context: SlaMutationContext,
  ): Promise<SlaEscalationRuleResponse> {
    return executeSlaOperation(async () => {
      await updateSlaEscalationRule(this.prisma, ruleId, input, context);
      return this.get(ruleId);
    });
  }

  delete(
    ruleId: string,
    reason: string,
    context: SlaMutationContext,
  ): Promise<void> {
    return executeSlaOperation(() =>
      deleteSlaEscalationRule(this.prisma, ruleId, reason, context),
    );
  }

  listChanges(ruleId: string): Promise<readonly SlaChangeLogResponse[]> {
    return executeSlaOperation(() =>
      listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.escalationRule,
        entityId: ruleId,
      }),
    );
  }
}
