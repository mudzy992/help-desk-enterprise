import { PrismaService } from '../../common/prisma/prisma.service';
import { SlaError } from './sla.error';
import { slaProfileScopeWhere, slaRuleScopeWhere, type SlaReadScope } from './sla-read-scope';

export async function requireSlaProfileReadScope(prisma: PrismaService, id: string, scope: SlaReadScope): Promise<void> {
  const scoped = slaProfileScopeWhere(scope);
  const row = await prisma.slaProfile.findFirst({ where: { id, ...(scoped ?? {}) }, select: { id: true } });
  if (row === null) throw new SlaError('PROFILE_NOT_FOUND');
}

export async function requireSlaCalendarReadScope(prisma: PrismaService, id: string, scope: SlaReadScope): Promise<void> {
  const profileWhere = slaProfileScopeWhere(scope);
  const row = await prisma.businessHoursCalendar.findFirst({
    where: { id, ...(profileWhere === undefined ? {} : { slaProfiles: { some: profileWhere } }) },
    select: { id: true },
  });
  if (row === null) throw new SlaError('CALENDAR_NOT_FOUND');
}

export async function requireSlaRuleReadScope(prisma: PrismaService, id: string, scope: SlaReadScope): Promise<void> {
  const ruleWhere = slaRuleScopeWhere(scope);
  const row = await prisma.slaRule.findFirst({ where: { id, ...(ruleWhere ?? {}) }, select: { id: true } });
  if (row === null) throw new SlaError('RULE_NOT_FOUND');
}

export async function requireSlaEscalationRuleReadScope(prisma: PrismaService, id: string, scope: SlaReadScope): Promise<void> {
  const profileWhere = slaProfileScopeWhere(scope);
  const row = await prisma.slaEscalationRule.findFirst({
    where: { id, ...(profileWhere === undefined ? {} : { slaProfile: profileWhere }) },
    select: { id: true },
  });
  if (row === null) throw new SlaError('ESCALATION_RULE_NOT_FOUND');
}
