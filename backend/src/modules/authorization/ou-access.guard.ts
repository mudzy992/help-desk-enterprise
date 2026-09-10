import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { authorizeHttpExecution } from './authorize-http-execution';

@Injectable()
export class OuAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    return authorizeHttpExecution({
      context,
      reflector: this.reflector,
      authorizationService: this.authorizationService,
      requireOrganizationalUnitScope: true,
    });
  }
}
