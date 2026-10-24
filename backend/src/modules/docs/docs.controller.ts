import { Controller, Get, Header, Param, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import {
  readPrincipalContext,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { docsLimits, parseDocsLocale } from './docs.constants';
import { DocsLocaleQueryDto } from './dto/docs-locale-query.dto';
import { runDocs } from './docs.error';
import { DocsService } from './docs.service';
import type { DocsNavigation, DocsPageResponse, DocsSearchResponse } from './docs.types';

/**
 * Docs modul (Faza 3, korak b): čitanje dokumentacije.
 *
 * Sadržaj zavisi od uloga pozivaoca, pa svi odgovori nose `Cache-Control:
 * no-store`; uloga se provjerava u servisu nad podacima sesije (§6).
 * Greške: nepoznat/nedozvoljen slug → 404, nedostupno ogledalo → 503.
 */
@Controller('docs')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get('navigation')
  @Header('Cache-Control', 'no-store')
  navigation(
    @Query() query: DocsLocaleQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<DocsNavigation> {
    return runDocs(() =>
      this.docs.navigation(globalPermissionKeysOf(request), parseDocsLocale(query.locale)),
    );
  }

  @Get('pages/:slug')
  @Header('Cache-Control', 'no-store')
  page(
    @Param('slug') slug: string,
    @Query() query: DocsLocaleQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<DocsPageResponse> {
    return runDocs(() =>
      this.docs.readPage(slug, globalPermissionKeysOf(request), parseDocsLocale(query.locale)),
    );
  }

  @Get('search')
  @Header('Cache-Control', 'no-store')
  search(
    @Query('q') query: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<DocsSearchResponse> {
    const parsed = Number.parseInt(limit ?? '', 10);
    return runDocs(() =>
      this.docs.search(
        query ?? '',
        Number.isNaN(parsed) ? docsLimits.searchDefaultLimit : parsed,
        globalPermissionKeysOf(request),
      ),
    );
  }
}

/** Global docs resources accept only permissions from unscoped assignments. */
function globalPermissionKeysOf(request: AuthenticatedHttpRequest): readonly string[] {
  const context: PrincipalContext | null = readPrincipalContext(request);
  if (context === null) return [];
  const permissions = context.assignments
    .filter((assignment) =>
      assignment.scope?.kind === 'global' ||
      (assignment.scope === undefined &&
        assignment.organizationalUnitId === null &&
        assignment.serviceId === null),
    )
    .flatMap((assignment) => assignment.permissionKeys);
  return [...new Set(permissions)];
}
