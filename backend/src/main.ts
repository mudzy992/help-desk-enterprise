import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplicationCors } from './common/cors/configure-application-cors';
import { RecentRequestLogBuffer } from './common/request-context/recent-request-log.buffer';
import { RequestContextLogger } from './common/request-context/request-context.logger';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';
import { RequestMetricsMiddleware } from './common/request-context/request-metrics.middleware';
import { startEventLoopLagMonitor } from './modules/observability/metrics/event-loop-lag.monitor';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  application.enableShutdownHooks();
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
  configureApplicationCors(application);
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
  const stopEventLoopLagMonitor = startEventLoopLagMonitor(
    requestContextLogger,
  );
  application.enableShutdownHooks();
  process.once('beforeExit', stopEventLoopLagMonitor);
  const port = Number(process.env.PORT ?? 10001);
  await application.listen(port);
}

void bootstrap();
