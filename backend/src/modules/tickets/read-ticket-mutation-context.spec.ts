import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  PRINCIPAL_CONTEXT_REQUEST_KEY,
} from '../authentication/authenticated-request';
import { readTicketMutationContext } from './read-ticket-mutation-context';

describe('readTicketMutationContext', () => {
  it('carries the durable authorization version and group ids into list cache keys', () => {
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: { subjectId: 'agent-1' },
      [PRINCIPAL_CONTEXT_REQUEST_KEY]: {
        subjectId: 'agent-1',
        authzVersion: 7,
        groupIds: ['group-b', 'group-a'],
      },
    } as never;

    expect(readTicketMutationContext(request)).toEqual({
      actorUserId: 'agent-1',
      principalAuthzVersion: 7,
      principalGroupIds: ['group-b', 'group-a'],
    });
  });

  it('keeps service callers without a principal context compatible', () => {
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: { subjectId: 'agent-1' },
    } as never;

    expect(readTicketMutationContext(request)).toEqual({
      actorUserId: 'agent-1',
    });
  });
});
