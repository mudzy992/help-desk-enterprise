import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SecurityIdentityController } from './security-identity.controller';
import { IdentityPasskeyService } from './identity-passkey.service';

/**
 * Paket 5.4.0-a: the security module grows wave by wave — 5.4.0-a ships the
 * passkey step-up for sensitive actions; 5.4.0-b adds the rate-limit
 * configuration + metrics endpoints, 5.4.0-d the bulk password reset and the
 * audit view. It sits next to the authentication module and reuses its
 * services through the exported surface.
 */
@Module({
  imports: [AuthenticationModule],
  controllers: [SecurityIdentityController],
  providers: [IdentityPasskeyService],
  exports: [IdentityPasskeyService],
})
export class SecurityModule {}
