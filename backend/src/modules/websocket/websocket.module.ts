import { Module } from '@nestjs/common';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { JwtSocketAuthenticationVerifier } from '../authentication/jwt-socket-authentication.verifier';
import { WebsocketAdapterHealthModule } from './websocket-adapter-health.module';
import { WebsocketAbuseLimiterModule } from './websocket-abuse-limiter.module';
import { LegacyGroupEmitNotice } from './legacy-group-emit-notice';
import { SocketAuthenticationService } from './socket-authentication.service';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';
import { SocketGroupMembershipService } from './socket-group-membership.service';
import { WebsocketGateway } from './websocket.gateway';
import { GroupRoomRevokeDispatcher } from './group-room-revoke.dispatcher';

@Module({
  imports: [
    AuthenticationModule,
    // W2.25: the dispatcher consumes the durable group-room revoke intents.
    OutboxModule,
    WebsocketAdapterHealthModule,
    WebsocketAbuseLimiterModule,
  ],
  providers: [
    {
      provide: SOCKET_AUTHENTICATION_VERIFIER,
      useExisting: JwtSocketAuthenticationVerifier,
    },
    SocketAuthenticationService,
    SocketGroupMembershipService,
    WebsocketGateway,
    LegacyGroupEmitNotice,
    // W2.25 (`BA-groups-02`): turns the committed membership-revoke intents into
    // cross-instance room events, with outbox retry when Redis is unavailable.
    GroupRoomRevokeDispatcher,
  ],
})
export class WebsocketModule {}
