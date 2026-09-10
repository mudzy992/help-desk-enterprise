import { normalizeEntraIdTokenClaims } from './normalize-entra-id-token-claims';

const tenantId = '11111111-1111-4111-8111-111111111111';
const objectId = '33333333-3333-4333-8333-333333333333';

describe('normalizeEntraIdTokenClaims', () => {
  it('normalizes required Entra identity claims', () => {
    expect(
      normalizeEntraIdTokenClaims({
        tenantId,
        payload: {
          oid: objectId.toUpperCase(),
          tid: tenantId.toUpperCase(),
          email: 'Agent@Example.com',
          name: ' Directory Agent ',
        },
      }),
    ).toEqual({
      externalSubject: objectId,
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      tenantId,
    });
  });

  it('uses preferred_username when email is absent', () => {
    expect(
      normalizeEntraIdTokenClaims({
        tenantId,
        payload: {
          oid: objectId,
          tid: tenantId,
          preferred_username: 'agent@example.com',
          name: 'Agent',
        },
      }),
    ).toEqual({
      externalSubject: objectId,
      email: 'agent@example.com',
      displayName: 'Agent',
      tenantId,
    });
  });

  it('fails closed for incomplete or mismatched identity data', () => {
    const validPayload = {
      oid: objectId,
      tid: tenantId,
      email: 'agent@example.com',
      name: 'Agent',
    };
    expect(() =>
      normalizeEntraIdTokenClaims({
        tenantId,
        payload: { ...validPayload, oid: undefined },
      }),
    ).toThrow(/INVALID_CREDENTIALS/);
    expect(() =>
      normalizeEntraIdTokenClaims({
        tenantId,
        payload: { ...validPayload, name: '  ' },
      }),
    ).toThrow(/INVALID_CREDENTIALS/);
    expect(() =>
      normalizeEntraIdTokenClaims({
        tenantId,
        payload: {
          ...validPayload,
          email: undefined,
          preferred_username: 'agent',
        },
      }),
    ).toThrow(/INVALID_CREDENTIALS/);
    expect(() =>
      normalizeEntraIdTokenClaims({
        tenantId,
        payload: {
          ...validPayload,
          tid: '44444444-4444-4444-8444-444444444444',
        },
      }),
    ).toThrow(/INVALID_CREDENTIALS/);
  });
});
