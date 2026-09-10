import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { sign, type SignOptions } from 'jsonwebtoken';
import { MicrosoftEntraIdTokenVerifier } from './microsoft-entra-id-token.verifier';
import { parseEntraAuthenticationConfiguration } from './parse-entra-authentication-configuration';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const objectId = '33333333-3333-4333-8333-333333333333';
const keyId = 'test-signing-key';
const configuration = parseEntraAuthenticationConfiguration({
  tenantId,
  clientId,
});

function createKeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync('rsa', { modulusLength: 2048 });
}

function createJwks(publicKey: KeyObject, kid = keyId): unknown {
  return {
    keys: [
      {
        ...publicKey.export({ format: 'jwk' }),
        kid,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}

function createFetch(jwks: unknown, ok = true): jest.MockedFunction<typeof fetch> {
  return jest.fn(async () => ({
    ok,
    json: async () => jwks,
  })) as unknown as jest.MockedFunction<typeof fetch>;
}

function createIdToken(
  privateKey: KeyObject,
  payload: Record<string, unknown> = {},
  signOptions: SignOptions = {},
): string {
  return sign(
    {
      oid: objectId,
      tid: tenantId,
      email: 'agent@example.com',
      name: 'Agent',
      ...payload,
    },
    privateKey,
    {
      algorithm: 'RS256',
      issuer: configuration.issuer,
      audience: clientId,
      keyid: keyId,
      expiresIn: '1h',
      ...signOptions,
    },
  );
}

describe('MicrosoftEntraIdTokenVerifier', () => {
  it('accepts a signature-verified Entra ID token with required claims', async () => {
    const { publicKey, privateKey } = createKeyPair();
    const fetchImplementation = createFetch(createJwks(publicKey));
    const verifier = new MicrosoftEntraIdTokenVerifier(fetchImplementation);
    const idToken = createIdToken(privateKey);
    await expect(
      verifier.verify({ idToken, configuration }),
    ).resolves.toEqual({
      externalSubject: objectId,
      email: 'agent@example.com',
      displayName: 'Agent',
      tenantId,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      configuration.jwksUrl,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(JSON.stringify(fetchImplementation.mock.calls)).not.toContain(idToken);
  });

  it('fails closed for invalid issuer, audience, tenant, or signature', async () => {
    const { publicKey, privateKey } = createKeyPair();
    const otherKeys = createKeyPair();
    const verifier = new MicrosoftEntraIdTokenVerifier(
      createFetch(createJwks(publicKey)),
    );
    const validToken = createIdToken(privateKey);
    await expect(
      verifier.verify({
        idToken: createIdToken(privateKey, {}, { issuer: `${configuration.issuer}/other` }),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      verifier.verify({
        idToken: createIdToken(privateKey, {}, { audience: '99999999-9999-4999-8999-999999999999' }),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      verifier.verify({
        idToken: createIdToken(privateKey, {
          tid: '44444444-4444-4444-8444-444444444444',
        }),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      verifier.verify({
        idToken: createIdToken(otherKeys.privateKey),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const rejected = await verifier
      .verify({ idToken: validToken.slice(0, -4) + 'abcd', configuration })
      .catch((error: unknown) => error);
    expect(rejected).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(JSON.stringify(rejected)).not.toContain(validToken);
  });

  it('fails closed when required claims are missing', async () => {
    const { publicKey, privateKey } = createKeyPair();
    const verifier = new MicrosoftEntraIdTokenVerifier(
      createFetch(createJwks(publicKey)),
    );
    await expect(
      verifier.verify({
        idToken: createIdToken(privateKey, { oid: undefined, sub: objectId }),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      verifier.verify({
        idToken: createIdToken(privateKey, { name: '' }),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      verifier.verify({ idToken: '   ', configuration }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('fails closed when JWKS cannot be loaded', async () => {
    const { privateKey } = createKeyPair();
    const verifier = new MicrosoftEntraIdTokenVerifier(createFetch({}, false));
    await expect(
      verifier.verify({
        idToken: createIdToken(privateKey),
        configuration,
      }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_UNAVAILABLE' });
  });
});
