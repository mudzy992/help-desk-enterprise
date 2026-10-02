import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { BotConnectorJwtValidator, botConnectorIssuer, botConnectorOpenIdMetadataUrl } from './bot-connector-jwt-validator';
import { assertServiceUrl, BotConnectorTeamsTransport } from './bot-connector-teams-transport';
import { BotTokenClient, buildClientAssertion } from './bot-token-client';
import { InMemoryTeamsSimulatorOutbox, SimulatorTeamsTransport } from './simulator-teams-transport';
import { signSimulatorActivity, verifySimulatorActivity } from './simulator-signature';
import { TeamsError } from './teams.error';

const tenantId = '11111111-1111-1111-1111-111111111111';
const appId = '22222222-2222-2222-2222-222222222222';
const credentials = { tenantId, appId, appSecret: 'secret-value' };
const serviceUrl = 'https://smba.trafficmanager.net/emea/';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'TeamsError', code });
}

describe('BotTokenClient', () => {
  it('caches tokens until five minutes before expiry and shares inflight requests', async () => {
    let now = 0;
    const fetchMock = jest.fn(async () => jsonResponse({ access_token: 'tok', expires_in: 3600 }));
    const client = new BotTokenClient(fetchMock as unknown as typeof fetch, () => now);
    const [a, b] = await Promise.all([client.getToken(credentials), client.getToken(credentials)]);
    expect([a, b]).toEqual(['tok', 'tok']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`);
    expect(String(init.body)).toContain('scope=https%3A%2F%2Fapi.botframework.com%2F.default');
    now = 54 * 60_000;
    await client.getToken(credentials);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now = 56 * 60_000;
    await client.getToken(credentials);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps failures to connector error codes', async () => {
    await expectCode(new BotTokenClient(jest.fn() as never).getToken({ ...credentials, appSecret: '' }), 'NOT_CONFIGURED');
    await expectCode(new BotTokenClient((async () => jsonResponse({}, 401)) as never).getToken(credentials), 'NOT_CONFIGURED');
    await expectCode(new BotTokenClient((async () => jsonResponse({}, 503)) as never).getToken(credentials), 'TOKEN_UNAVAILABLE');
    await expectCode(new BotTokenClient((async () => { throw new Error('down'); }) as never).getToken(credentials), 'TOKEN_UNAVAILABLE');
  });
});

describe('BotConnectorTeamsTransport', () => {
  function setup(responses: Response[]) {
    const fetchMock = jest.fn(async () => responses.shift() ?? jsonResponse({}, 500));
    const tokens = { getToken: jest.fn(async () => 'tok'), invalidate: jest.fn() } as unknown as BotTokenClient;
    const transport = new BotConnectorTeamsTransport(fetchMock as unknown as typeof fetch, tokens, async () => credentials);
    return { fetchMock, tokens, transport };
  }

  it('creates a personal conversation and sends/updates activities', async () => {
    const { fetchMock, transport } = setup([jsonResponse({ id: 'a:conv' }), jsonResponse({ id: 'act-1' }), jsonResponse(undefined)]);
    const address = await transport.createPersonalConversation({ serviceUrl, tenantId, userAadObjectId: 'user-oid' });
    expect(address).toEqual({ serviceUrl, conversationId: 'a:conv' });
    const sent = await transport.sendActivity(address, { type: 'message', text: 'Zdravo' });
    expect(sent.activityId).toBe('act-1');
    await transport.updateActivity(address, 'act-1', { type: 'message', text: 'Novo' });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe(`${serviceUrl}v3/conversations`);
    expect(JSON.parse(String(calls[0][1].body))).toMatchObject({ bot: { id: `28:${appId}` }, tenantId });
    expect(calls[1][0]).toBe(`${serviceUrl}v3/conversations/a%3Aconv/activities`);
    expect(calls[2][1].method).toBe('PUT');
    expect((calls[2][1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('retries once on 401 with a fresh token and maps 404/429/500', async () => {
    const retry = setup([jsonResponse({}, 401), jsonResponse({ id: 'x' })]);
    await expect(retry.transport.sendActivity({ serviceUrl, conversationId: 'c' }, { type: 'message' })).resolves.toEqual({ activityId: 'x' });
    expect(retry.tokens.invalidate).toHaveBeenCalledTimes(1);
    await expectCode(setup([jsonResponse({}, 404)]).transport.sendActivity({ serviceUrl, conversationId: 'c' }, { type: 'message' }), 'CONVERSATION_GONE');
    const throttled = setup([jsonResponse({}, 429, { 'retry-after': '7' })]).transport.sendActivity({ serviceUrl, conversationId: 'c' }, { type: 'message' });
    await expect(throttled).rejects.toMatchObject({ code: 'THROTTLED', retryAfterSeconds: 7, retryable: true });
    await expectCode(setup([jsonResponse({}, 500)]).transport.sendActivity({ serviceUrl, conversationId: 'c' }, { type: 'message' }), 'TRANSPORT_FAILED');
  });

  it('refuses untrusted service URLs before sending a token', async () => {
    expect(() => assertServiceUrl('https://evil.example.com/')).toThrow(TeamsError);
    expect(() => assertServiceUrl('http://smba.trafficmanager.net/emea/')).toThrow(TeamsError);
    expect(assertServiceUrl('https://smba.trafficmanager.net/emea')).toBe(serviceUrl);
    const { fetchMock, transport } = setup([]);
    await expectCode(transport.sendActivity({ serviceUrl: 'https://evil.example.com/', conversationId: 'c' }, { type: 'message' }), 'UNAUTHORIZED_ACTIVITY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SimulatorTeamsTransport', () => {
  it('records activities in the outbox with deterministic personal conversations', async () => {
    const outbox = new InMemoryTeamsSimulatorOutbox();
    const transport = new SimulatorTeamsTransport(outbox, () => 'id-1');
    const address = await transport.createPersonalConversation({ serviceUrl: 'x', tenantId, userAadObjectId: 'oid' });
    expect(address.conversationId).toBe('sim-personal:oid');
    expect(await transport.sendActivity(address, { type: 'message', text: 'a' })).toEqual({ activityId: 'sim-activity:id-1' });
    await transport.updateActivity(address, 'sim-activity:id-1', { type: 'message', text: 'b' });
    expect(outbox.entries.map((e) => e.operation)).toEqual(['send', 'update']);
  });
});

describe('simulator signature', () => {
  const secret = 'x'.repeat(32);
  const now = 1_800_000_000_000;
  const timestamp = String(now / 1000);
  it('accepts a valid signature and rejects tampering, stale timestamps and weak secrets', () => {
    const body = '{"type":"message"}';
    const signature = signSimulatorActivity(secret, timestamp, body);
    expect(() => verifySimulatorActivity({ secret, signature, timestamp, rawBody: body, now })).not.toThrow();
    expect(() => verifySimulatorActivity({ secret, signature, timestamp, rawBody: body + ' ', now })).toThrow(/signature/);
    expect(() => verifySimulatorActivity({ secret, signature, timestamp, rawBody: body, now: now + 6 * 60_000 })).toThrow(/timestamp/);
    expect(() => verifySimulatorActivity({ secret: 'short', signature, timestamp, rawBody: body, now })).toThrow(/TEAMS_SIMULATOR_SECRET/);
  });
});

describe('BotConnectorJwtValidator', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', endorsements: ['msteams'] };
  function fetchFor(keys: unknown[]) {
    return jest.fn(async (url: string) =>
      url === botConnectorOpenIdMetadataUrl ? jsonResponse({ jwks_uri: 'https://login.botframework.com/v1/.well-known/keys' }) : jsonResponse({ keys }),
    );
  }
  function token(claims: Record<string, unknown> = {}, kid = 'k1') {
    return sign({ serviceurl: serviceUrl, ...claims }, privateKey, { algorithm: 'RS256', keyid: kid, issuer: botConnectorIssuer, audience: appId, expiresIn: 300 });
  }

  it('accepts a valid Bot Connector token and caches keys', async () => {
    const fetchMock = fetchFor([jwk]);
    const validator = new BotConnectorJwtValidator(fetchMock as unknown as typeof fetch);
    const result = await validator.validate({ authorizationHeader: `Bearer ${token()}`, appId, activityServiceUrl: serviceUrl.replace(/\/$/, '') });
    expect(result.serviceUrl).toBe(serviceUrl);
    await validator.validate({ authorizationHeader: `Bearer ${token()}`, appId, activityServiceUrl: serviceUrl });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects wrong audience, serviceUrl mismatch, missing endorsement and unknown keys', async () => {
    const validator = new BotConnectorJwtValidator(fetchFor([jwk]) as unknown as typeof fetch);
    await expectCode(validator.validate({ authorizationHeader: undefined, appId, activityServiceUrl: serviceUrl }), 'UNAUTHORIZED_ACTIVITY');
    await expectCode(validator.validate({ authorizationHeader: `Bearer ${token()}`, appId: '33333333-3333-3333-3333-333333333333', activityServiceUrl: serviceUrl }), 'UNAUTHORIZED_ACTIVITY');
    await expectCode(validator.validate({ authorizationHeader: `Bearer ${token()}`, appId, activityServiceUrl: 'https://other.botframework.com/' }), 'UNAUTHORIZED_ACTIVITY');
    await expectCode(validator.validate({ authorizationHeader: `Bearer ${token({}, 'k2')}`, appId, activityServiceUrl: serviceUrl }), 'UNAUTHORIZED_ACTIVITY');
    const unendorsed = new BotConnectorJwtValidator(fetchFor([{ ...jwk, endorsements: ['skype'] }]) as unknown as typeof fetch);
    await expectCode(unendorsed.validate({ authorizationHeader: `Bearer ${token()}`, appId, activityServiceUrl: serviceUrl }), 'UNAUTHORIZED_ACTIVITY');
  });
});

describe('certificate client assertion', () => {
  it('signs an RS256 assertion with x5t when a certificate is configured', async () => {
    expect(() => buildClientAssertion('not a pem', appId, 'https://login.microsoftonline.com/x/oauth2/v2.0/token', 0)).toThrow(TeamsError);
    const fetchMock = jest.fn(async () => jsonResponse({ access_token: 't', expires_in: 3600 }));
    await expectCode(new BotTokenClient(fetchMock as never).getToken({ ...credentials, appSecret: '', certificatePem: 'bad' }), 'NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
