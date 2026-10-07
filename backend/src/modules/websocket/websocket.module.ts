import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { JwtSocketAuthenticationVerifier } from '../authentication/jwt-socket-authentication.verifier';
import { LegacyGroupEmitNotice } from './legacy-group-emit-notice';
import { SocketAuthenticationService } from './socket-authentication.service';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication-verifier-token';
import { SocketGroupMembershipService } from './socket-group-membership.service';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  imports: [AuthenticationModule],
  providers: [
    {
      provide: SOCKET_AUTHENTICATION_VERIFIER,
      useExisting: JwtSocketAuthenticationVerifier,
    },
    SocketAuthenticationService,
    SocketGroupMembershipService,
    WebsocketGateway,
    LegacyGroupEmitNotice,
  ],
})
export class WebsocketModule {}
