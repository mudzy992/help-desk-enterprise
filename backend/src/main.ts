import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createGlobalValidationPipe } from './common/validation/create-global-validation-pipe';
import { configureApplicationCors } from './common/cors/configure-application-cors';
import { RecentRequestLogBuffer } from './common/request-context/recent-request-log.buffer';
import { RequestContextLogger } from './common/request-context/request-context.logger';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';
import { RequestMetricsMiddleware } from './common/request-context/request-metrics.middleware';
import { startEventLoopLagMonitor } from './modules/observability/metrics/event-loop-lag.monitor';
import { createHttpMetricsMiddleware, HttpMetricsService } from './modules/ops-health/http-metrics.service';

const jsonBodyLimit = '512kb';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Paket 3.1: the Teams simulator HMAC is computed over the exact request bytes.
    rawBody: true,
  });
  application.enableShutdownHooks();
  // Paket 4.1: the branding logo travels as a base64 data URL (≤200 KB file ≈
  // 270 KB text). Express's default 100 KB JSON limit rejected larger logos;
  // 512 KB covers it with headroom while still bounding request bodies.
  application.useBodyParser('json', { limit: jsonBodyLimit });
  const requestIdMiddleware = new RequestIdMiddleware();
  application.use(
    (
      request: { headers: Record<string, unknown> },
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      requestIdMiddleware.use(request, response, next);
    },
  );
  // Review 2026-09-25: behind Coolify/Traefik `request.ip` is the proxy unless
  // Express trusts it. TRUST_PROXY=1 (one hop) makes the login limiter per IP.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy !== undefined && trustProxy.length > 0) {
    const hops = Number(trustProxy);
    (
      application.getHttpAdapter().getInstance() as {
        set(name: string, value: unknown): void;
      }
    ).set('trust proxy', Number.isFinite(hops) ? hops : trustProxy);
  }
  // Review 2026-09-25 (S9): standard security headers (HSTS, nosniff,
  // frame-ancestors none, no X-Powered-By). The API serves JSON and file
  // downloads only, so the strict default CSP is fine; CORP stays cross-origin
  // because the desk and the browser extension load attachments from here.
  application.use(
    helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
  );
  configureApplicationCors(application);
  application.useGlobalPipes(createGlobalValidationPipe());
  const requestContextLogger = new RequestContextLogger(
    application.get(RecentRequestLogBuffer),
  );
  application.useLogger(requestContextLogger);
  const requestMetricsMiddleware = new RequestMetricsMiddleware(
    requestContextLogger,
  );
  application.use(
    (
      request: {
        headers: Record<string, unknown>;
        method?: string;
        originalUrl?: string;
        url?: string;
      },
      response: {
        statusCode?: number;
        once(event: 'finish', listener: () => void): unknown;
      },
      next: () => void,
    ) => {
      requestMetricsMiddleware.use(request, response, next);
    },
  );
  // Paket 2.7 (§4.3): per-minute request/5xx counters for alarms and the health card.
  application.use(createHttpMetricsMiddleware(application.get(HttpMetricsService)));
  const stopEventLoopLagMonitor = startEventLoopLagMonitor(
    requestContextLogger,
  );
  application.enableShutdownHooks();
  process.once('beforeExit', stopEventLoopLagMonitor);
  const port = Number(process.env.PORT ?? 10001);
  await application.listen(port);
}

void bootstrap();
