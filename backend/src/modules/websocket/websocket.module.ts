import { Module } from '@nestjs/common';
import { SocketAuthenticationService } from './socket-authentication.service';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';
import { UnavailableSocketAuthenticationVerifier } from './unavailable-socket-authentication.verifier';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  providers: [
    {
      provide: SOCKET_AUTHENTICATION_VERIFIER,
      useClass: UnavailableSocketAuthenticationVerifier,
    },
    SocketAuthenticationService,
    WebsocketGateway,
  ],
})
export class WebsocketModule {}
