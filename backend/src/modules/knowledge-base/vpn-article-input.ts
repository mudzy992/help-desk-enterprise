import { knowledgeBaseTestIds } from './knowledge-base-test-ids';
import type { CreateKnowledgeArticleInput } from './knowledge-base.types';

export function vpnArticleInput(
  overrides: Partial<CreateKnowledgeArticleInput> = {},
): CreateKnowledgeArticleInput {
  return {
    title: 'Reset VPN password',
    body: 'Use the self-service portal to reset your VPN client password.',
    serviceId: knowledgeBaseTestIds.serviceVpn,
    organizationalUnitId: knowledgeBaseTestIds.ouIt,
    ownerUserId: knowledgeBaseTestIds.agentIt,
    reviewerUserId: knowledgeBaseTestIds.adminIt,
    reason: 'create knowledge article',
    ...overrides,
  };
}
