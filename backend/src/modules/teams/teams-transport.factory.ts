import { Inject, Injectable, Optional } from '@nestjs/common';
import { BotConnectorTeamsTransport } from './bot-connector-teams-transport';
import { BotTokenClient } from './bot-token-client';
import { PrismaTeamsSimulatorOutbox } from './prisma-teams-simulator-outbox';
import { SimulatorTeamsTransport } from './simulator-teams-transport';
import { TeamsConfigurationService } from './teams-configuration.service';
import { TeamsError } from './teams.error';
import { TEAMS_FETCH, type TeamsTransport } from './teams-transport';

/** Paket 3.1: picks the transport for the current mode (settings can change at runtime). */
@Injectable()
export class TeamsTransportFactory {
  private readonly fetchImplementation: typeof fetch;
  private readonly tokens: BotTokenClient;
  private readonly simulator: SimulatorTeamsTransport;
  private readonly live: BotConnectorTeamsTransport;

  constructor(
    private readonly configuration: TeamsConfigurationService,
    outbox: PrismaTeamsSimulatorOutbox,
    @Optional() @Inject(TEAMS_FETCH) fetchImplementation?: typeof fetch,
  ) {
    this.fetchImplementation = fetchImplementation ?? fetch;
    this.tokens = new BotTokenClient(this.fetchImplementation);
    this.simulator = new SimulatorTeamsTransport(outbox);
    this.live = new BotConnectorTeamsTransport(this.fetchImplementation, this.tokens, async () => {
      const config = await this.configuration.load();
      return { tenantId: config.tenantId, appId: config.botAppId, appSecret: await this.configuration.loadBotSecret(), certificatePem: await this.configuration.loadBotCertificate() };
    });
  }

  async forMode(mode: 'off' | 'simulator' | 'live'): Promise<TeamsTransport> {
    if (mode === 'simulator') return this.simulator;
    if (mode === 'live') return this.live;
    throw new TeamsError('NOT_CONFIGURED', 'Teams connector is off');
  }

  /** Readiness check (§16): can a token be obtained with the stored credentials? */
  async testToken(): Promise<void> {
    const config = await this.configuration.load();
    this.tokens.invalidate();
    await this.tokens.getToken({ tenantId: config.tenantId, appId: config.botAppId, appSecret: await this.configuration.loadBotSecret(), certificatePem: await this.configuration.loadBotCertificate() });
  }

  get fetch(): typeof fetch {
    return this.fetchImplementation;
  }
}
