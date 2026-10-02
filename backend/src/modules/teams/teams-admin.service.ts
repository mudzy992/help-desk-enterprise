import { defaultAppName } from '../branding/branding.constants';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { signSimulatorActivity, simulatorSignatureHeader, simulatorTimestampHeader } from './simulator-signature';
import { simulatorServiceUrl } from './simulator-teams-transport';
import { buildTeamsAppPackage, buildTeamsManifest, validateTeamsManifest } from './teams-app-package';
import { teamsChannelEvents, simulatorTenantId, type TeamsChannelEvent } from './teams.constants';
import { TeamsConfigurationService } from './teams-configuration.service';
import { simulatedUserPrefix } from './teams-identity.service';
import { TeamsInboundService } from './teams-inbound.service';
import { TeamsTransportFactory } from './teams-transport.factory';

export type TeamsReadinessKey = 'addon' | 'tenant' | 'appId' | 'credential' | 'token' | 'publicUrl' | 'endpoint' | 'simulatorSecret';
export interface TeamsReadinessCheck {
  readonly key: TeamsReadinessKey;
  readonly ok: boolean;
  /** Short technical detail (never a secret). */
  readonly detail?: string;
}

export interface SimulatorActivityInput {
  readonly kind: 'install' | 'message' | 'action';
  readonly userId: string;
  readonly scope: 'personal' | 'channel';
  readonly text?: string;
  readonly verb?: string;
  readonly data?: Record<string, unknown>;
  /** Activity id of the clicked card: an invoke response card replaces it, as in Teams. */
  readonly replyToId?: string;
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const simulatorTeamId = 'sim-team';
const simulatorChannelConversation = 'sim-channel:general';

/** Messaging endpoint the client registers in Azure Bot (API origin + route). */
export function teamsMessagingEndpoint(): string | null {
  const base = (process.env.API_PUBLIC_URL ?? process.env.APP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/integrations/teams/messages` : null;
}

/**
 * Paket 3.1 (§16, §17): Administration → Teams. Status, readiness, the app
 * package, channel links and — in simulator mode — the simulated Teams client.
 * The simulator signs activities server-side, so the secret never reaches the browser.
 */
@Injectable()
export class TeamsAdminService {
  private readonly logger = new Logger(TeamsAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuration: TeamsConfigurationService,
    private readonly transports: TeamsTransportFactory,
    private readonly inbound: TeamsInboundService,
  ) {}

  async status() {
    const config = await this.configuration.load();
    const [personal, channels, linkedGroups, lastInbound, lastCard, failed] = await Promise.all([
      this.prisma.teamsConversation.count({ where: { kind: 'PERSONAL', removedAt: null } }),
      this.prisma.teamsConversation.count({ where: { kind: 'CHANNEL', removedAt: null } }),
      this.prisma.teamsGroupChannel.count(),
      this.prisma.teamsInboundActivity.findFirst({ orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
      this.prisma.teamsCardMessage.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      this.prisma.integrationJob.count({ where: { type: 'TEAMS', status: { in: ['FAILED', 'DLQ'] } } }),
    ]);
    return {
      mode: config.mode,
      configuredMode: config.configuredMode,
      addonEnabled: config.addonEnabled,
      simulatorAvailable: config.mode === 'simulator',
      personalConversations: personal,
      channelConversations: channels,
      linkedGroups,
      lastInboundAt: lastInbound?.receivedAt ?? null,
      lastDeliveryAt: lastCard?.updatedAt ?? null,
      failedDeliveries: failed,
      messagingEndpoint: teamsMessagingEndpoint(),
    };
  }

  async readiness(): Promise<{ ready: boolean; mode: string; checks: TeamsReadinessCheck[] }> {
    const config = await this.configuration.load();
    const checks: TeamsReadinessCheck[] = [{ key: 'addon', ok: config.addonEnabled }];
    if (config.configuredMode === 'simulator') {
      checks.push({ key: 'simulatorSecret', ok: config.simulatorSecretConfigured });
    } else {
      checks.push({ key: 'tenant', ok: guid.test(config.tenantId) });
      checks.push({ key: 'appId', ok: guid.test(config.botAppId) });
      const credential = Boolean((await this.configuration.loadBotCertificate()) || (await this.configuration.loadBotSecret()));
      checks.push({ key: 'credential', ok: credential });
      if (credential && guid.test(config.tenantId) && guid.test(config.botAppId)) {
        try {
          await this.transports.testToken();
          checks.push({ key: 'token', ok: true });
        } catch (error) {
          checks.push({ key: 'token', ok: false, detail: error instanceof Error ? error.message.slice(0, 200) : 'error' });
        }
      } else {
        checks.push({ key: 'token', ok: false });
      }
      checks.push(await this.checkEndpoint());
    }
    checks.push({ key: 'publicUrl', ok: Boolean(config.publicUrl?.startsWith('https://')), detail: config.publicUrl ?? undefined });
    return { ready: checks.every((check) => check.ok), mode: config.configuredMode, checks };
  }

  /** The endpoint must answer over HTTPS from outside (any HTTP status proves reachability). */
  private async checkEndpoint(): Promise<TeamsReadinessCheck> {
    const endpoint = teamsMessagingEndpoint();
    if (!endpoint?.startsWith('https://')) return { key: 'endpoint', ok: false, detail: endpoint ?? undefined };
    try {
      const response = await this.transports.fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(5_000) });
      return { key: 'endpoint', ok: true, detail: `${endpoint} (HTTP ${response.status})` };
    } catch (error) {
      return { key: 'endpoint', ok: false, detail: `${endpoint}: ${error instanceof Error ? error.message.slice(0, 120) : 'error'}` };
    }
  }

  async appPackage(locale: 'bs' | 'en'): Promise<{ fileName: string; content: Buffer }> {
    const config = await this.configuration.load();
    if (!guid.test(config.botAppId)) throw new BadRequestException({ code: 'TEAMS_APP_ID_REQUIRED', message: 'Bot App ID (GUID) is required for the package.' });
    if (!config.publicUrl?.startsWith('https://')) throw new BadRequestException({ code: 'TEAMS_PUBLIC_URL_REQUIRED', message: 'APP_PUBLIC_URL must be an https URL.' });
    const input = { botAppId: config.botAppId, appName: config.appName || defaultAppName, publicUrl: config.publicUrl, locale };
    const problems = validateTeamsManifest(buildTeamsManifest(input));
    if (problems.length > 0) throw new BadRequestException({ code: 'TEAMS_MANIFEST_INVALID', message: problems.join('; ') });
    return { fileName: 'teams-app.zip', content: await buildTeamsAppPackage(input) };
  }

  // ---- channels -------------------------------------------------------------

  async channels() {
    const links = await this.prisma.teamsGroupChannel.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        events: true,
        includeTitle: true,
        createdAt: true,
        group: { select: { id: true, name: true } },
        conversation: { select: { teamName: true, channelName: true, mode: true, removedAt: true } },
      },
    });
    return {
      events: teamsChannelEvents,
      items: links.map((link) => ({
        id: link.id,
        groupId: link.group.id,
        groupName: link.group.name,
        teamName: link.conversation.teamName,
        channelName: link.conversation.channelName,
        mode: link.conversation.mode === 'LIVE' ? 'live' : 'simulator',
        removed: link.conversation.removedAt !== null,
        events: link.events,
        includeTitle: link.includeTitle,
        createdAt: link.createdAt,
      })),
    };
  }

  async updateChannel(id: string, input: { events?: string[]; includeTitle?: boolean }) {
    const events = input.events?.filter((event): event is TeamsChannelEvent => (teamsChannelEvents as readonly string[]).includes(event));
    try {
      await this.prisma.teamsGroupChannel.update({
        where: { id },
        data: { ...(events ? { events: [...new Set(events)] } : {}), ...(input.includeTitle === undefined ? {} : { includeTitle: input.includeTitle }) },
      });
    } catch {
      throw new NotFoundException({ code: 'TEAMS_CHANNEL_NOT_FOUND', message: 'Channel link not found.' });
    }
    return this.channels();
  }

  async removeChannel(id: string) {
    const removed = await this.prisma.teamsGroupChannel.deleteMany({ where: { id } });
    if (removed.count === 0) throw new NotFoundException({ code: 'TEAMS_CHANNEL_NOT_FOUND', message: 'Channel link not found.' });
    return this.channels();
  }

  // ---- simulator (§5) --------------------------------------------------------

  private async requireSimulator(): Promise<void> {
    const config = await this.configuration.load();
    if (config.mode !== 'simulator') throw new BadRequestException({ code: 'TEAMS_SIMULATOR_OFF', message: 'The simulator is available only in simulator mode.' });
  }

  async simulatorMessages(conversationId: string, limit = 50) {
    await this.requireSimulator();
    const rows = await this.prisma.teamsSimulatorMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, activityId: true, direction: true, payload: true, createdAt: true, updatedAt: true },
    });
    return { conversationId, items: rows.reverse() };
  }

  /** Conversation id the simulator uses for a user and scope. */
  async simulatorConversationId(userId: string, scope: 'personal' | 'channel'): Promise<string> {
    if (scope === 'channel') return simulatorChannelConversation;
    return `sim-personal:${await this.simulatedAadObjectId(userId)}`;
  }

  async sendSimulatorActivity(input: SimulatorActivityInput) {
    await this.requireSimulator();
    const secret = process.env.TEAMS_SIMULATOR_SECRET ?? '';
    const aadObjectId = await this.simulatedAadObjectId(input.userId);
    const config = await this.configuration.load();
    const tenantId = config.tenantId || simulatorTenantId;
    const conversationId = await this.simulatorConversationId(input.userId, input.scope);
    const channelData =
      input.scope === 'channel'
        ? { tenant: { id: tenantId }, team: { id: simulatorTeamId, name: 'Simulator' }, channel: { id: simulatorChannelConversation, name: 'General' } }
        : { tenant: { id: tenantId } };
    const base = {
      id: `sim-${randomUUID()}`,
      serviceUrl: simulatorServiceUrl,
      timestamp: new Date().toISOString(),
      from: { id: `29:${aadObjectId}`, aadObjectId },
      recipient: { id: '28:simulator-bot', name: 'bot' },
      conversation: { id: conversationId, conversationType: input.scope, tenantId },
      channelData,
    };
    let activity: Record<string, unknown>;
    if (input.kind === 'install') {
      activity = { ...base, type: 'conversationUpdate', membersAdded: [{ id: '28:simulator-bot' }], ...(input.scope === 'channel' ? { channelData: { ...channelData, eventType: 'teamMemberAdded' } } : {}) };
    } else if (input.kind === 'message') {
      const text = (input.text ?? '').trim().slice(0, 2000);
      if (!text) throw new BadRequestException({ code: 'TEAMS_SIMULATOR_TEXT_REQUIRED', message: 'Text is required.' });
      activity = { ...base, type: 'message', text: input.scope === 'channel' ? `<at>bot</at> ${text}` : text };
    } else {
      if (!input.verb) throw new BadRequestException({ code: 'TEAMS_SIMULATOR_VERB_REQUIRED', message: 'Verb is required.' });
      activity = { ...base, type: 'invoke', name: 'adaptiveCard/action', value: { action: { type: 'Action.Execute', verb: input.verb, data: input.data ?? {} } } };
    }
    const rawBody = JSON.stringify(activity);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const result = await this.inbound.handle({
      body: activity,
      rawBody,
      headers: { [simulatorSignatureHeader]: signSimulatorActivity(secret, timestamp, rawBody), [simulatorTimestampHeader]: timestamp },
    });
    const body = result.body as { type?: unknown; value?: unknown } | undefined;
    if (input.kind === 'action' && input.replyToId && body?.type === 'application/vnd.microsoft.card.adaptive' && body.value) {
      const payload = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: body.value }] };
      await this.prisma.teamsSimulatorMessage.updateMany({ where: { activityId: input.replyToId, conversationId, direction: 'OUTBOUND' }, data: { payload: JSON.parse(JSON.stringify(payload)) as object } });
    }
    this.logger.log(`teams_simulator_activity kind=${input.kind} scope=${input.scope} status=${result.status}`);
    return { conversationId, status: result.status, response: result.body ?? null };
  }

  /** Entra object ID of the user, or the simulator-only synthetic ID. */
  private async simulatedAadObjectId(userId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, anonymizedAt: null }, select: { id: true, entraObjectId: true } });
    if (!user) throw new NotFoundException({ code: 'TEAMS_SIMULATOR_USER_NOT_FOUND', message: 'User not found.' });
    return user.entraObjectId ?? `${simulatedUserPrefix}${user.id}`;
  }
}
