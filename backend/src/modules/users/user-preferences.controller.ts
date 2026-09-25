import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { emailLocales } from '../notifications/email/email-template.constants';

export class UpdateUserPreferencesDto {
  /** null clears the choice (the installation default applies again). */
  @IsOptional()
  @IsIn([...emailLocales, null])
  preferredLocale?: (typeof emailLocales)[number] | null;
}

export type UserPreferencesResponse = {
  readonly preferredLocale: string | null;
};

/**
 * Paket 1.5: the signed-in user's own preferences. The UI language switch
 * saves here so e-mails arrive in the same language as the application.
 */
@Controller('users/me/preferences')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class UserPreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async read(@Req() request: AuthenticatedHttpRequest): Promise<UserPreferencesResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: requireSubject(request) },
      select: { preferredLocale: true },
    });
    return { preferredLocale: user?.preferredLocale ?? null };
  }

  @Patch()
  async update(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    const subjectId = requireSubject(request);
    if (body.preferredLocale === undefined) {
      return this.read(request);
    }
    const updated = await this.prisma.user.update({
      where: { id: subjectId },
      data: { preferredLocale: body.preferredLocale },
      select: { preferredLocale: true },
    });
    return { preferredLocale: updated.preferredLocale };
  }
}

function requireSubject(request: AuthenticatedHttpRequest): string {
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
  }
  return principal.subjectId;
}
