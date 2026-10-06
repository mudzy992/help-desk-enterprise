import { organizationalUnitDeleteErrorCode } from './organizational-unit.error';

describe('organizationalUnitDeleteErrorCode', () => {
  it.each([
    ['groups', 'HAS_GROUPS'],
    ['assets', 'HAS_ASSETS'],
    ['assetContracts', 'HAS_ASSETS'],
    ['softwareLicenses', 'HAS_ASSETS'],
    ['changeRequests', 'HAS_CHANGE_REQUESTS'],
    ['knowledgeArticles', 'HAS_KNOWLEDGE_ARTICLES'],
    ['knowledgeInterceptResolutions', 'HAS_KNOWLEDGE_ARTICLES'],
    ['problems', 'HAS_PROBLEMS'],
    ['routingRules', 'HAS_ROUTING_RULES'],
    ['tickets', 'HAS_TICKETS'],
  ] as const)('maps %s to %s', (kind, code) => {
    expect(organizationalUnitDeleteErrorCode(kind)).toBe(code);
  });
});
