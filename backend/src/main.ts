import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplicationCors } from './common/cors/configure-application-cors';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule);
  application.enableShutdownHooks();
  configureApplicationCors(application);
  const port = Number(process.env.PORT ?? 10001);
  await application.listen(port);
}

void bootstrap();
