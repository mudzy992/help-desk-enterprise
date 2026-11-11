import type { Prisma } from '../../generated/prisma/client';
import type { TicketScopeFacts } from './template-scope';

type ResponseTemplateWhere = Prisma.ResponseTemplateWhereInput;

/**
 * Val 3 (M13/B2): the picker used to read up to 500 rows in an arbitrary order
 * and only then apply the scope ranking in memory, so on a large template set
 * the rows an agent actually needs could be cut off before the ranking even saw
 * them. The scope match is now part of the query (the same tiers as
 * `scoreTemplateScope`), so the database returns relevant rows first.
 */
const globalScope: ResponseTemplateWhere = {
  services: { none: {} },
  categories: { none: {} },
  groups: { none: {} },
};

const hasAnyScope: ResponseTemplateWhere = {
  OR: [
    { services: { some: {} } },
    { categories: { some: {} } },
    { groups: { some: {} } },
  ],
};

/** Rows that may be offered for the ticket (`scoreTemplateScope` >= 0). */
export function pickerScopeWhere(facts: TicketScopeFacts | null): ResponseTemplateWhere {
  if (facts === null) {
    return globalScope;
  }
  return {
    OR: [
      globalScope,
      { services: { some: { serviceId: facts.serviceId } } },
      ...(facts.categoryId === null
        ? []
        : [{ categories: { some: { categoryId: facts.categoryId } } }]),
      ...(facts.assignedGroupId === null
        ? []
        : [{ groups: { some: { groupId: facts.assignedGroupId } } }]),
    ],
  };
}

/**
 * Rows scoped elsewhere (`scoreTemplateScope` === -1) — only fetched for
 * "show all", so a ticket-less picker stops at the global templates.
 */
export function pickerOffScopeWhere(facts: TicketScopeFacts | null): ResponseTemplateWhere {
  if (facts === null) {
    return hasAnyScope;
  }
  return {
    AND: [
      hasAnyScope,
      { services: { none: { serviceId: facts.serviceId } } },
      ...(facts.categoryId === null
        ? []
        : [{ categories: { none: { categoryId: facts.categoryId } } }]),
      ...(facts.assignedGroupId === null
        ? []
        : [{ groups: { none: { groupId: facts.assignedGroupId } } }]),
    ],
  };
}
