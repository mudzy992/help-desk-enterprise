import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { createShadowAuthorizationReport } from './create-shadow-authorization-report';
import {
  createAuthorizationLookups,
  evaluateAuthorizationRequest,
  type AuthorizationRequestInput,
} from './evaluate-authorization-request';
import type { ShadowAuthorizationReport } from './shadow-authorization.types';

@Injectable()
export class ShadowAuthorizationService {
  constructor(
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly prisma: PrismaService,
  ) {}

  async evaluate(
    input: AuthorizationRequestInput,
  ): Promise<ShadowAuthorizationReport> {
    const evaluation = await evaluateAuthorizationRequest(
      input,
      createAuthorizationLookups(this.authorizationContextLoader, this.prisma),
    );
    return createShadowAuthorizationReport(evaluation);
  }
}
