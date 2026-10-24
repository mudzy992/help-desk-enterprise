import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { mapAccountSecurityError } from '../authentication/security/account-security.error';
import { MfaService } from '../authentication/security/mfa.service';
import { IdentityPasskeyService } from './identity-passkey.service';

export type StepUpCaller = {
  readonly subjectId: string;
  readonly sessionId: string | null;
};

/** One fail-closed proof boundary for every privileged security operation. */
@Injectable()
export class StepUpPolicyService {
  constructor(
    private readonly mfaService: MfaService,
    private readonly identityPasskeyService: IdentityPasskeyService,
    private readonly userLoader: AuthenticationUserLoader,
  ) {}

  async assertConfirmed(input: {
    readonly caller: StepUpCaller;
    readonly purpose: string;
    readonly code?: string;
    readonly requireLocalSuperAdmin: boolean;
  }): Promise<'passkey' | 'totp' | 'recovery'> {
    const purpose = input.purpose.trim();
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(purpose)) this.deny('IDENTITY_CONFIRMATION_FAILED');
    const subject = await this.userLoader.findById(input.caller.subjectId);
    if (subject === null || !subject.isActive) this.deny('USER_NOT_FOUND');
    if (
      input.requireLocalSuperAdmin &&
      (!subject.isLocalOnly || !subject.roleKeys.includes(authorizationRoleKeys.superAdmin))
    ) this.deny('IDENTITY_CONFIRMATION_REQUIRED');

    if (input.caller.sessionId !== null) {
      try {
        if (await this.identityPasskeyService.consumeFreshConfirmation(input.caller.sessionId, purpose)) {
          return 'passkey';
        }
      } catch {
        // An ambiguous consume must never fall through to another factor: the
        // marker may already have been consumed on the dependency side.
        this.deny('IDENTITY_CONFIRMATION_FAILED');
      }
    }
    if (!(await this.mfaService.isEnabled(subject.id))) {
      this.deny('IDENTITY_CONFIRMATION_REQUIRED');
    }
    try {
      return await this.mfaService.verify(subject, input.code?.trim() ?? '');
    } catch (error) {
      mapAccountSecurityError(error);
      throw error;
    }
  }

  private deny(code: string): never {
    throw new UnauthorizedException({ code });
  }
}
