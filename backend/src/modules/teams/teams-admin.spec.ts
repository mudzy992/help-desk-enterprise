import JSZip from 'jszip';
import { verifySimulatorActivity } from './simulator-signature';
import { TeamsAdminService, teamsMessagingEndpoint } from './teams-admin.service';
import { buildTeamsAppPackage, buildTeamsManifest, monogramPng, validateTeamsManifest } from './teams-app-package';

const secret = 's'.repeat(40);
const appId = '11111111-2222-3333-4444-555555555555';

function setup(mode: 'simulator' | 'live' | 'off' = 'simulator', user: { id: string; entraObjectId: string | null } | null = { id: 'u1', entraObjectId: null }) {
  const config = { mode, configuredMode: mode === 'off' ? 'simulator' : mode, addonEnabled: mode !== 'off', simulatorSecretConfigured: true, tenantId: '', botAppId: appId, appName: 'Servis desk', publicUrl: 'https://desk.example.com' };
  const prisma = {
    user: { findFirst: jest.fn(async () => user) },
    teamsSimulatorMessage: { findMany: jest.fn(async () => [{ id: 'm2' }, { id: 'm1' }]), updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const inbound = { handle: jest.fn(async () => ({ status: 200, body: { ok: true } })) };
  const service = new TeamsAdminService(prisma as never, { load: async () => config, loadBotSecret: async () => '', loadBotCertificate: async () => '' } as never, {} as never, inbound as never);
  return { service, inbound, prisma };
}

describe('Teams app package', () => {
  it('builds a valid manifest from settings', () => {
    const manifest = buildTeamsManifest({ botAppId: appId, appName: 'Servis desk', publicUrl: 'https://desk.example.com', locale: 'bs' });
    expect(validateTeamsManifest(manifest)).toEqual([]);
    expect(manifest).toMatchObject({ id: appId, validDomains: ['desk.example.com'], name: { short: 'Servis desk' } });
    expect(JSON.stringify(manifest)).toContain('createTicketFromMessage');
    expect(validateTeamsManifest({ ...manifest, id: 'x', validDomains: ['https://x'] })).toHaveLength(2);
  });
  it('zips manifest and monogram icons of the required sizes', async () => {
    const zip = await JSZip.loadAsync(await buildTeamsAppPackage({ botAppId: appId, appName: 'Šalter', publicUrl: 'https://desk.example.com', locale: 'en' }));
    expect(Object.keys(zip.files).sort()).toEqual(['color.png', 'manifest.json', 'outline.png']);
    const color = await zip.file('color.png')!.async('nodebuffer');
    expect(color.subarray(1, 4).toString()).toBe('PNG');
    expect(color.readUInt32BE(16)).toBe(192);
    expect(monogramPng(32, 'S', 'outline').readUInt32BE(20)).toBe(32);
  });
});

describe('TeamsAdminService simulator', () => {
  const previous = process.env.TEAMS_SIMULATOR_SECRET;
  beforeAll(() => {
    process.env.TEAMS_SIMULATOR_SECRET = secret;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TEAMS_SIMULATOR_SECRET;
    else process.env.TEAMS_SIMULATOR_SECRET = previous;
  });

  it('signs activities server-side and uses the synthetic id without Entra', async () => {
    const { service, inbound } = setup();
    const result = await service.sendSimulatorActivity({ kind: 'message', userId: 'u1', scope: 'personal', text: 'moji tiketi' });
    expect(result).toMatchObject({ conversationId: 'sim-personal:sim-user:u1', status: 200 });
    const call = (inbound.handle.mock.calls as unknown as [{ body: { from: { aadObjectId: string }; text: string }; rawBody: string; headers: Record<string, string> }][])[0]![0];
    expect(call.body.from.aadObjectId).toBe('sim-user:u1');
    expect(() => verifySimulatorActivity({ secret, signature: call.headers['x-teams-simulator-signature'], timestamp: call.headers['x-teams-simulator-timestamp'], rawBody: call.rawBody })).not.toThrow();
  });

  it('mentions the bot in channels and builds Action.Execute invokes', async () => {
    const { service, inbound } = setup('simulator', { id: 'u1', entraObjectId: 'aad-1' });
    await service.sendSimulatorActivity({ kind: 'message', userId: 'u1', scope: 'channel', text: 'link' });
    await service.sendSimulatorActivity({ kind: 'action', userId: 'u1', scope: 'personal', verb: 'ticket.claim', data: { ticketId: 't1' } });
    const replaced = setup('simulator', { id: 'u1', entraObjectId: 'aad-1' });
    replaced.inbound.handle.mockResolvedValueOnce({ status: 200, body: { type: 'application/vnd.microsoft.card.adaptive', value: { type: 'AdaptiveCard' } } } as never);
    await replaced.service.sendSimulatorActivity({ kind: 'action', userId: 'u1', scope: 'personal', verb: 'ticket.claim', replyToId: 'out-1' });
    expect(replaced.prisma.teamsSimulatorMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activityId: 'out-1', conversationId: 'sim-personal:aad-1', direction: 'OUTBOUND' } }));
    const bodies = (inbound.handle.mock.calls as unknown as [{ body: Record<string, unknown> }][]).map(([request]) => request.body);
    expect(bodies[0]).toMatchObject({ text: '<at>bot</at> link', conversation: { conversationType: 'channel' } });
    expect(bodies[1]).toMatchObject({ type: 'invoke', name: 'adaptiveCard/action', conversation: { id: 'sim-personal:aad-1' }, value: { action: { verb: 'ticket.claim' } } });
  });

  it('refuses outside simulator mode and lists messages oldest first', async () => {
    await expect(setup('live').service.sendSimulatorActivity({ kind: 'install', userId: 'u1', scope: 'personal' })).rejects.toThrow();
    expect((await setup().service.simulatorMessages('c')).items.map((item) => item.id)).toEqual(['m1', 'm2']);
  });

  it('reports simulator readiness and the messaging endpoint', async () => {
    const readiness = await setup().service.readiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.map((check) => check.key)).toEqual(['addon', 'simulatorSecret', 'publicUrl']);
    const previousUrl = process.env.API_PUBLIC_URL;
    process.env.API_PUBLIC_URL = 'https://api.example.com/';
    expect(teamsMessagingEndpoint()).toBe('https://api.example.com/integrations/teams/messages');
    if (previousUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousUrl;
  });
});
