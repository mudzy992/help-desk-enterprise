import { Global, Module } from '@nestjs/common';
import { WebsocketAdapterHealthService } from './websocket-adapter-health.service';

@Global()
@Module({
  providers: [WebsocketAdapterHealthService],
  exports: [WebsocketAdapterHealthService],
})
export class WebsocketAdapterHealthModule {}
