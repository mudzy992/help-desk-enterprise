import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { WebsocketAbuseLimiter } from './websocket-abuse-limiter';

@Module({
  imports: [AuthenticationModule],
  providers: [WebsocketAbuseLimiter],
  exports: [WebsocketAbuseLimiter],
})
export class WebsocketAbuseLimiterModule {}
