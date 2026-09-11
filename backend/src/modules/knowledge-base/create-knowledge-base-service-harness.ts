import type { AuthorizationContext } from '../authorization/authorization.types';
import { defaultKnowledgeBaseConfiguration } from './knowledge-base.constants';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import { KnowledgeBaseDiscoveryService } from './knowledge-base-discovery.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseWorkflowService } from './knowledge-base-workflow.service';
import type { KnowledgeBaseConfiguration } from './knowledge-base.types';
import { createInMemoryKnowledgePrisma } from './create-in-memory-knowledge-prisma';
import { knowledgeBaseTestIds } from './knowledge-base-test-ids';
import { seedKnowledgeBaseHarnessActors } from './seed-knowledge-base-harness-actors';

export { knowledgeBaseTestIds } from './knowledge-base-test-ids';

type MutableKnowledgeBaseConfiguration = {
  -readonly [K in keyof KnowledgeBaseConfiguration]: KnowledgeBaseConfiguration[K];
};

export function createKnowledgeBaseServiceHarness() {
  const memory = createInMemoryKnowledgePrisma();
  const contexts = new Map<string, AuthorizationContext>();
  const configuration: MutableKnowledgeBaseConfiguration = {
    ...defaultKnowledgeBaseConfiguration,
  };
  const authorizationContextLoader = {
    loadBySubjectId: async (subjectId: string) =>
      contexts.get(subjectId) ?? null,
  };
  const configurationLoader = {
    load: async () => ({ ...configuration }),
  } as KnowledgeBaseConfigurationLoader;
  const articles = new KnowledgeBaseService(
    memory.prisma as never,
    authorizationContextLoader as never,
    configurationLoader,
  );
  const workflow = new KnowledgeBaseWorkflowService(
    memory.prisma as never,
    authorizationContextLoader as never,
    configurationLoader,
  );
  const discovery = new KnowledgeBaseDiscoveryService(
    memory.prisma as never,
    authorizationContextLoader as never,
    configurationLoader,
  );
  seedCatalog(memory);
  seedKnowledgeBaseHarnessActors(contexts);
  return {
    memory,
    articles,
    workflow,
    discovery,
    configuration,
    contexts,
  };
}

function seedCatalog(
  memory: ReturnType<typeof createInMemoryKnowledgePrisma>,
): void {
  memory.seedUnit({ id: knowledgeBaseTestIds.ouRoot, ouPath: '/Korisnici' });
  memory.seedUnit({
    id: knowledgeBaseTestIds.ouIt,
    ouPath: '/Korisnici/IT',
  });
  memory.seedUnit({
    id: knowledgeBaseTestIds.ouHr,
    ouPath: '/Korisnici/HR',
  });
  memory.seedService({ id: knowledgeBaseTestIds.serviceVpn });
  memory.seedService({ id: knowledgeBaseTestIds.servicePayroll });
  memory.seedGroup({ id: knowledgeBaseTestIds.groupIt });
  memory.seedUser({ id: knowledgeBaseTestIds.requester });
  memory.seedUser({ id: knowledgeBaseTestIds.ownerUser });
  memory.seedUser({ id: knowledgeBaseTestIds.reviewerUser });
  memory.seedUser({ id: knowledgeBaseTestIds.agentIt });
  memory.seedUser({ id: knowledgeBaseTestIds.agentHr });
  memory.seedUser({ id: knowledgeBaseTestIds.adminIt });
  memory.seedUser({ id: knowledgeBaseTestIds.superAdmin });
  memory.seedGroupMember({
    groupId: knowledgeBaseTestIds.groupIt,
    userId: knowledgeBaseTestIds.agentIt,
  });
}
