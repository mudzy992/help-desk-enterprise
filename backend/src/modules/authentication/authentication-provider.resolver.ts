import { Injectable } from '@nestjs/common';
import { AuthenticationModeLoader } from './authentication-mode.loader';
import type { AuthenticationProvider } from './authentication.types';
import { EntraAuthenticationProvider } from './entra-authentication.provider';
import { LocalAuthenticationProvider } from './local-authentication.provider';

@Injectable()
export class AuthenticationProviderResolver {
  constructor(
    private readonly authenticationModeLoader: AuthenticationModeLoader,
    private readonly localAuthenticationProvider: LocalAuthenticationProvider,
    private readonly entraAuthenticationProvider: EntraAuthenticationProvider,
  ) {}

  async resolve(): Promise<AuthenticationProvider> {
    const mode = await this.authenticationModeLoader.load();
    if (mode === 'local') {
      return this.localAuthenticationProvider;
    }
    return this.entraAuthenticationProvider;
  }
}
