import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 10001);
  await application.listen(port);
}

void bootstrap();
