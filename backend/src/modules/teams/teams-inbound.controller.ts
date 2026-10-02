import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { TeamsInboundService } from './teams-inbound.service';

interface RawRequest {
  readonly body: unknown;
  readonly rawBody?: Buffer;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip?: string;
}

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
  end(): void;
}

const windowMs = 60_000;
const maxPerWindow = 300;

/**
 * Paket 3.1 (§7, §13): the bot messaging endpoint. It is deliberately not
 * behind the session guard — Bot Connector (live) authenticates with a signed
 * JWT and the simulator with an HMAC, both verified in TeamsInboundService.
 * Bodies above the JSON parser limit are refused with 413 by the platform.
 */
@Controller('integrations/teams')
export class TeamsInboundController {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly inbound: TeamsInboundService) {}

  @Post('messages')
  @HttpCode(200)
  async messages(@Req() request: RawRequest, @Res() response: JsonResponse): Promise<void> {
    if (!this.allow(request.ip ?? 'unknown')) {
      response.status(429).end();
      return;
    }
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) headers[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    const result = await this.inbound.handle({ body: request.body, rawBody: request.rawBody?.toString('utf8') ?? '', headers });
    if (result.body) response.status(result.status).json(result.body);
    else response.status(result.status).end();
  }

  /** Simple per-IP window (no global throttler exists); generous for Bot Connector bursts. */
  private allow(ip: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= maxPerWindow;
  }
}
