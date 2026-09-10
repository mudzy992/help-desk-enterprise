import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SettingsModule } from '../settings/settings.module';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationModeLoader } from './authentication-mode.loader';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import { AuthenticationService } from './authentication.service';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { EntraAuthenticationProvider } from './entra-authentication.provider';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import { JwtSocketAuthenticationVerifier } from './jwt-socket-authentication.verifier';
import { LocalAuthenticationProvider } from './local-authentication.provider';
import { SessionTokenService } from './session-token.service';

@Module({
  imports: [SettingsModule, JwtModule.register({})],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationUserLoader,
    AuthenticationModeLoader,
    JwtSigningSecretLoader,
    LocalAuthenticationProvider,
    EntraAuthenticationProvider,
    AuthenticationProviderResolver,
    SessionTokenService,
    JwtSocketAuthenticationVerifier,
    AuthenticationService,
  ],
  exports: [JwtSocketAuthenticationVerifier, AuthenticationService],
})
export class AuthenticationModule {}
