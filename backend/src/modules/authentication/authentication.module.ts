import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SettingsModule } from '../settings/settings.module';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationModeLoader } from './authentication-mode.loader';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import { AuthenticationService } from './authentication.service';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { EntraAuthenticationConfigurationLoader } from './entra-authentication-configuration.loader';
import { EntraAuthenticationProvider } from './entra-authentication.provider';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import { JwtSocketAuthenticationVerifier } from './jwt-socket-authentication.verifier';
import { LocalAuthenticationProvider } from './local-authentication.provider';
import { MicrosoftEntraIdTokenVerifier } from './microsoft-entra-id-token.verifier';
import { SessionAuthenticationGuard } from './session-authentication.guard';
import { SessionTokenService } from './session-token.service';

@Module({
  imports: [SettingsModule, JwtModule.register({})],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationUserLoader,
    AuthenticationModeLoader,
    JwtSigningSecretLoader,
    EntraAuthenticationConfigurationLoader,
    MicrosoftEntraIdTokenVerifier,
    LocalAuthenticationProvider,
    EntraAuthenticationProvider,
    AuthenticationProviderResolver,
    SessionTokenService,
    JwtSocketAuthenticationVerifier,
    SessionAuthenticationGuard,
    AuthenticationService,
  ],
  exports: [
    JwtSocketAuthenticationVerifier,
    AuthenticationService,
    SessionAuthenticationGuard,
  ],
})
export class AuthenticationModule {}
