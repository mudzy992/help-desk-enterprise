import { Module } from '@nestjs/common';
import { WebsocketAdapterHealthModule } from '../websocket/websocket-adapter-health.module';
import { HealthController } from './health.controller';

@Module({
  imports: [WebsocketAdapterHealthModule],
  controllers: [HealthController],
})
export class HealthModule {}
