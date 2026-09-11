import { evaluateConfidentialTicketAccess } from './evaluate-confidential-ticket-access';
import { defaultTicketConfidentialConfiguration } from './confidential.constants';
import type { ConfidentialAccessFacts } from './confidential.types';

const deniedFacts: ConfidentialAccessFacts = {
  isRequester: false,
  isAssignee: false,
  isHandlerGroupMember: false,
  isExplicitParticipant: false,
  hasUserGrant: false,
  hasGroupGrant: false,
  hasAllowedViewerRole: false,
  hasAllowedViewerGroup: false,
  hasActiveBreakGlass: false,
  canInvokeBreakGlass: false,
};

describe('evaluateConfidentialTicketAccess', () => {
  it('allows non-confidential tickets without ACL facts', () => {
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: false,
        configuration: defaultTicketConfidentialConfiguration,
        facts: deniedFacts,
      }),
    ).toEqual({ allowed: true, via: 'not_confidential' });
  });

  it('allows requester, assignee, handler group, and grants', () => {
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: true,
        configuration: defaultTicketConfidentialConfiguration,
        facts: { ...deniedFacts, isRequester: true },
      }).allowed,
    ).toBe(true);
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: true,
        configuration: defaultTicketConfidentialConfiguration,
        facts: { ...deniedFacts, isHandlerGroupMember: true },
      }),
    ).toMatchObject({ allowed: true, via: 'handler_group' });
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: true,
        configuration: defaultTicketConfidentialConfiguration,
        facts: { ...deniedFacts, hasUserGrant: true },
      }),
    ).toMatchObject({ allowed: true, via: 'grant' });
  });

  it('denies scoped staff and offers break-glass only when authorized', () => {
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: true,
        configuration: defaultTicketConfidentialConfiguration,
        facts: deniedFacts,
      }),
    ).toEqual({ allowed: false, breakGlassAvailable: false });
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: true,
        configuration: defaultTicketConfidentialConfiguration,
        facts: { ...deniedFacts, canInvokeBreakGlass: true },
      }),
    ).toEqual({ allowed: false, breakGlassAvailable: true });
    expect(
      evaluateConfidentialTicketAccess({
        isConfidential: true,
        configuration: defaultTicketConfidentialConfiguration,
        facts: { ...deniedFacts, hasActiveBreakGlass: true },
      }),
    ).toMatchObject({ allowed: true, via: 'break_glass' });
  });
});
