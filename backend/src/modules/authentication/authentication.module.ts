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
import { EntraIdentityBinder } from './entra-identity-binder';
import { AuthenticationProvidersService } from './authentication-providers.service';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import { JwtSocketAuthenticationVerifier } from './jwt-socket-authentication.verifier';
import { LocalAuthenticationProvider } from './local-authentication.provider';
import { MicrosoftEntraIdTokenVerifier } from './microsoft-entra-id-token.verifier';
import { SessionAuthenticationGuard } from './session-authentication.guard';
import { SessionTokenService } from './session-token.service';
import { AccountSecurityController } from './account-security.controller';
import { AccountSecurityNotifier } from './security/account-security-notifier';
import { AccountSecurityPolicyLoader } from './security/account-security-policy.loader';
import { MfaService } from './security/mfa.service';
import { PasswordChangeService } from './security/password-change.service';
import { SessionRegistryService } from './security/session-registry.service';

@Module({
  imports: [SettingsModule, JwtModule.register({})],
  controllers: [AuthenticationController, AccountSecurityController],
  providers: [
    AuthenticationUserLoader,
    PrincipalContextLoader,
    PrincipalContextInvalidator,
    AuthenticationModeLoader,
    JwtSigningSecretLoader,
    EntraAuthenticationConfigurationLoader,
    MicrosoftEntraIdTokenVerifier,
    LocalAuthenticationProvider,
    EntraIdentityBinder,
    AuthenticationProvidersService,
    EntraAuthenticationProvider,
    AuthenticationProviderResolver,
    SessionTokenService,
    LoginAttemptLimiter,
    SessionRevocationStore,
    JwtSocketAuthenticationVerifier,
    SessionAuthenticationGuard,
    AuthenticationService,
    AccountSecurityNotifier,
    AccountSecurityPolicyLoader,
    MfaService,
    PasswordChangeService,
    SessionRegistryService,
  ],
  exports: [
    AccountSecurityPolicyLoader,
    MfaService,
    PasswordChangeService,
    SessionRegistryService,
    SessionRevocationStore,
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
