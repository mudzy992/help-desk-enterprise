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
import { IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { emailLocales } from '../notifications/email/email-template.constants';
import {
  defaultKeyboardShortcutsForRoles,
  resolveKeyboardShortcuts,
} from './resolve-keyboard-shortcuts';

export class UpdateUserPreferencesDto {
  /** null clears the choice (the installation default applies again). */
  @IsOptional()
  @IsIn([...emailLocales, null])
  preferredLocale?: (typeof emailLocales)[number] | null;

  /** Paket 2.8 §4.3: single-key shortcuts; null = default by role. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsBoolean()
  keyboardShortcuts?: boolean | null;
}

export type UserPreferencesResponse = {
  readonly preferredLocale: string | null;
  /** The user's explicit choice; null = default by role. */
  readonly keyboardShortcuts: boolean | null;
  /** What the UI applies (explicit choice, else the role default). */
  readonly keyboardShortcutsEffective: boolean;
  readonly keyboardShortcutsDefault: boolean;
};

const preferencesSelect = {
  preferredLocale: true,
  keyboardShortcuts: true,
  userRoles: { select: { role: { select: { key: true } } } },
} as const;

type PreferencesRow = {
  readonly preferredLocale: string | null;
  readonly keyboardShortcuts: boolean | null;
  readonly userRoles: readonly { readonly role: { readonly key: string } }[];
};

export function toUserPreferencesResponse(row: PreferencesRow | null): UserPreferencesResponse {
  const roleKeys = row?.userRoles.map((assignment) => assignment.role.key) ?? [];
  const stored = row?.keyboardShortcuts ?? null;
  return {
    preferredLocale: row?.preferredLocale ?? null,
    keyboardShortcuts: stored,
    keyboardShortcutsEffective: resolveKeyboardShortcuts(stored, roleKeys),
    keyboardShortcutsDefault: defaultKeyboardShortcutsForRoles(roleKeys),
  };
}

/**
 * Paket 1.5: the signed-in user's own preferences. The UI language switch
 * saves here so e-mails arrive in the same language as the application.
 * Paket 2.8: also the keyboard-shortcut switch (a personal preference like the
 * language, so no audit entry).
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
      select: preferencesSelect,
    });
    return toUserPreferencesResponse(user);
  }

  @Patch()
  async update(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    const subjectId = requireSubject(request);
    const data: { preferredLocale?: string | null; keyboardShortcuts?: boolean | null } = {};
    if (body.preferredLocale !== undefined) {
      data.preferredLocale = body.preferredLocale;
    }
    if (body.keyboardShortcuts !== undefined) {
      data.keyboardShortcuts = body.keyboardShortcuts;
    }
    if (Object.keys(data).length === 0) {
      return this.read(request);
    }
    const updated = await this.prisma.user.update({
      where: { id: subjectId },
      data,
      select: preferencesSelect,
    });
    return toUserPreferencesResponse(updated);
  }
}

function requireSubject(request: AuthenticatedHttpRequest): string {
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
  }
  return principal.subjectId;
}
