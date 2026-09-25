import { SessionRevocationStore } from './session-revocation.store';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SettingsModule } from '../settings/settings.module';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationModeLoader } from './authentication-mode.loader';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import { AuthenticationService } from './authentication.service';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
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
    PrincipalContextLoader,
    PrincipalContextInvalidator,
    AuthenticationModeLoader,
    JwtSigningSecretLoader,
    EntraAuthenticationConfigurationLoader,
    MicrosoftEntraIdTokenVerifier,
    LocalAuthenticationProvider,
    EntraAuthenticationProvider,
    AuthenticationProviderResolver,
    SessionTokenService,
    LoginAttemptLimiter,
    SessionRevocationStore,
    JwtSocketAuthenticationVerifier,
    SessionAuthenticationGuard,
    AuthenticationService,
  ],
  exports: [
    JwtSocketAuthenticationVerifier,
    AuthenticationService,
    SessionAuthenticationGuard,
    SessionTokenService,
    AuthenticationUserLoader,
    PrincipalContextLoader,
    PrincipalContextInvalidator,
  ],
})
export class AuthenticationModule {}
