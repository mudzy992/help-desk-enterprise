import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplicationCors } from './common/cors/configure-application-cors';
import { RecentRequestLogBuffer } from './common/request-context/recent-request-log.buffer';
import { RequestContextLogger } from './common/request-context/request-context.logger';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';

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
  application.useLogger(
    new RequestContextLogger(application.get(RecentRequestLogBuffer)),
  );
  const port = Number(process.env.PORT ?? 10001);
  await application.listen(port);
}

void bootstrap();
