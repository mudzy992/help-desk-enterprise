import { Injectable, Logger } from '@nestjs/common';
import { BotConnectorJwtValidator } from './bot-connector-jwt-validator';
import { PrismaTeamsSimulatorOutbox } from './prisma-teams-simulator-outbox';
import { simulatorServiceUrl } from './simulator-teams-transport';
import { verifySimulatorActivity } from './simulator-signature';
import { activityTenantId, parseTeamsActivity } from './teams-activity';
import { TeamsActivityRouter, type TeamsInvokeResponse } from './teams-activity-router.service';
import { TeamsConfigurationService } from './teams-configuration.service';
import { simulatorTenantId } from './teams.constants';
import { TeamsConversationsService } from './teams-conversations.service';
import { TeamsError } from './teams.error';
import { TeamsTransportFactory } from './teams-transport.factory';

export interface TeamsInboundRequest {
  readonly body: unknown;
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

export type TeamsInboundResult =
  | { readonly status: 200; readonly body?: Record<string, unknown> }
  | { readonly status: 400 | 401 | 403 | 404 | 503; readonly body?: undefined };

/**
 * Paket 3.1 (§7 steps 1–5): mode → authentication → tenant → idempotency →
 * routing. Errors never leak details to the caller; they are logged.
 */
@Injectable()
export class TeamsInboundService {
  private readonly logger = new Logger(TeamsInboundService.name);
  private jwtValidator: BotConnectorJwtValidator | null = null;

  constructor(
    private readonly configuration: TeamsConfigurationService,
    private readonly transports: TeamsTransportFactory,
    private readonly conversations: TeamsConversationsService,
    private readonly router: TeamsActivityRouter,
    private readonly outbox: PrismaTeamsSimulatorOutbox,
  ) {}

  async handle(request: TeamsInboundRequest): Promise<TeamsInboundResult> {
    const config = await this.configuration.load();
    if (config.mode === 'off') return { status: 404 };
    const activity = parseTeamsActivity(request.body);
    if (!activity) return { status: 400 };
    try {
      if (config.mode === 'simulator') {
        verifySimulatorActivity({
          secret: process.env.TEAMS_SIMULATOR_SECRET,
          signature: request.headers['x-teams-simulator-signature'],
          timestamp: request.headers['x-teams-simulator-timestamp'],
          rawBody: request.rawBody,
        });
        if (activity.serviceUrl !== simulatorServiceUrl) return { status: 400 };
      } else {
        if (!config.botAppId || !config.tenantId) return { status: 503 };
        this.jwtValidator ??= new BotConnectorJwtValidator(this.transports.fetch);
        await this.jwtValidator.validate({ authorizationHeader: request.headers.authorization, appId: config.botAppId, activityServiceUrl: activity.serviceUrl });
      }
    } catch (error) {
      if (error instanceof TeamsError && error.code === 'TOKEN_UNAVAILABLE') {
        this.logger.warn(`teams_inbound_keys_unavailable reason=${error.message}`);
        return { status: 503 };
      }
      this.logger.warn(`teams_inbound_rejected mode=${config.mode} reason=${error instanceof Error ? error.message : String(error)}`);
      return { status: 401 };
    }
    const expectedTenant = config.tenantId || (config.mode === 'simulator' ? simulatorTenantId : '');
    const tenant = activityTenantId(activity);
    if (!tenant || tenant.toLowerCase() !== expectedTenant.toLowerCase()) {
      this.logger.warn(`teams_inbound_tenant_mismatch mode=${config.mode}`);
      return { status: 403 };
    }
    if (!(await this.conversations.claimActivity(activity.id))) return { status: 200 };
    if (config.mode === 'simulator') await this.outbox.recordInbound(activity.conversation.id, activity.id, request.body);
    const transport = await this.transports.forMode(config.mode);
    let response: TeamsInvokeResponse | null;
    try {
      response = await this.router.route(activity, config, transport);
    } catch (error) {
      // Teams retries non-2xx deliveries; a routing failure is logged and acknowledged.
      this.logger.error(`teams_inbound_route_failed type=${activity.type} reason=${error instanceof Error ? error.message : String(error)}`);
      return activity.type === 'invoke' ? { status: 200, body: { statusCode: 500, type: 'application/vnd.microsoft.error', value: { code: 'InternalError', message: 'Action failed' } } } : { status: 200 };
    }
    return response ? { status: 200, body: response.body } : { status: 200 };
  }
}
