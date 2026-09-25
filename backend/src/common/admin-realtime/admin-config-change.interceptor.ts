import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedHttpRequest } from '../../modules/authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../../modules/authentication/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { AdminConfigRealtimeHub } from './admin-config-realtime.hub';
import { adminConfigDomainsMetadataKey } from './admin-config-domain.metadata';
import type {
  AdminConfigDomain,
  AdminConfigUpdatedPayload,
} from './admin-config-realtime.types';

const actionByMethod: Readonly<Record<string, AdminConfigUpdatedPayload['action']>> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

type RequestLike = AuthenticatedHttpRequest & { readonly method?: string };

@Injectable()
export class AdminConfigChangeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminConfigChangeInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly hub: AdminConfigRealtimeHub,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const action = actionByMethod[(request.method ?? 'GET').toUpperCase()];
    const domains =
      this.reflector.getAllAndOverride<AdminConfigDomain[] | undefined>(
        adminConfigDomainsMetadataKey,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (action === undefined || domains.length === 0) {
      return next.handle();
    }
    return next.handle().pipe(
      tap(() => {
        void this.publish(domains, action, readSubjectId(request));
      }),
    );
  }

  private async publish(
    domains: readonly AdminConfigDomain[],
    action: AdminConfigUpdatedPayload['action'],
    actorUserId: string | null,
  ): Promise<void> {
    let actorName: string | null = null;
    try {
      actorName =
        actorUserId === null
          ? null
          : ((
              await this.prisma.user.findUnique({
                where: { id: actorUserId },
                select: { displayName: true },
              })
            )?.displayName ?? null);
    } catch {
      this.logger.warn('admin_config_actor_lookup_failed');
    }
    const occurredAt = new Date().toISOString();
    for (const domain of domains) {
      this.hub.publish({ domain, action, actorUserId, actorName, occurredAt });
    }
  }
}

function readSubjectId(request: RequestLike): string | null {
  return readAuthenticatedPrincipal(request)?.subjectId ?? null;
}
