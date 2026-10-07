import { ConflictException } from '@nestjs/common';
import { organizationalUnitDeleteErrorCode, OrganizationalUnitError } from './organizational-unit.error';
import { mapOrganizationalUnitError } from './map-organizational-unit-error';

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

  it('maps a protected last-SuperAdmin cascade to a stable 409 response', () => {
    const error = mapOrganizationalUnitError(
      new OrganizationalUnitError('LAST_SUPER_ADMIN_REQUIRED'),
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'LAST_SUPER_ADMIN_REQUIRED' });
  });
});
