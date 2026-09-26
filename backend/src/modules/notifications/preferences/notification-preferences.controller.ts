import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type Redis from 'ioredis';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { redisTokens } from '../../../common/redis/redis.tokens';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
} from '../../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { assertCanManageTargetUser } from '../../users/assert-can-manage-target-user';
import { highestRoleRank, notificationEmailModes } from './notification-preference-catalog';
import { NotificationDigestService } from './notification-digest.service';
import {
  NotificationPreferencesError,
  NotificationPreferencesService,
  type NotificationPreferencesSummary,
  type NotificationPreferencesView,
} from './notification-preferences.service';

const clock = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export class NotificationPreferenceChangeDto {
  @IsString()
  @MaxLength(64)
  category!: string;

  @IsOptional()
  @IsBoolean()
  inApp?: boolean | null;

  @IsOptional()
  @IsIn([...notificationEmailModes, null])
  email?: string | null;
}

export class NotificationScheduleChangeDto {
  @IsOptional() @IsBoolean() quietHoursEnabled?: boolean;
  @IsOptional() @Matches(clock) quietStart?: string;
  @IsOptional() @Matches(clock) quietEnd?: string;
  @IsOptional() @IsBoolean() quietWeekends?: boolean;
  @IsOptional() @Matches(clock) digestTime?: string | null;
  @IsOptional() @IsBoolean() digestWorkdaysOnly?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceChangeDto)
  preferences?: NotificationPreferenceChangeDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationScheduleChangeDto)
  schedule?: NotificationScheduleChangeDto;
}

/** N10: one probe digest per user in 5 minutes. */
const testDigestWindowSeconds = 300;

/**
 * Paket 2.2 (N10). Static `me/...` routes are declared first so `me` never
 * reaches the `:userId` handlers (Express matches in declaration order).
 */
@Controller('users')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class NotificationPreferencesController {
  private readonly localTestSends = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly preferencesService: NotificationPreferencesService,
    private readonly digestService: NotificationDigestService,
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
  ) {}

  @Get('me/notification-preferences')
  async read(@Req() request: AuthenticatedHttpRequest): Promise<NotificationPreferencesView> {
    const { userId, rank } = await this.caller(request);
    return this.preferencesService.view(userId, rank);
  }

  @Put('me/notification-preferences')
  async update(
    @Req() request: AuthenticatedHttpRequest,
    @Body() body: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesView> {
    const { userId, rank } = await this.caller(request);
    try {
      await this.preferencesService.update(userId, rank, body);
    } catch (error) {
      mapPreferencesError(error);
    }
    return this.preferencesService.view(userId, rank);
  }

  @Delete('me/notification-preferences')
  async resetOwn(@Req() request: AuthenticatedHttpRequest): Promise<NotificationPreferencesView> {
    const { userId, rank } = await this.caller(request);
    await this.preferencesService.reset(userId);
    return this.preferencesService.view(userId, rank);
  }

  @Post('me/notification-preferences/test-digest')
  @HttpCode(202)
  async testDigest(@Req() request: AuthenticatedHttpRequest): Promise<{ sent: true }> {
    const { userId } = await this.caller(request);
    if (!(await this.claimTestSlot(userId))) {
      throw new HttpException(
        { code: 'TEST_DIGEST_RATE_LIMITED', message: 'One test digest per 5 minutes' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const result = await this.digestService.sendTest(userId);
    if (!result.sent) {
      throw new ServiceUnavailableException({
        code: result.reason ?? 'EMAIL_CHANNEL_DISABLED',
        message: 'E-mail delivery is not configured',
      });
    }
    return { sent: true };
  }

  @Get(':userId/notification-preferences')
  async summary(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<NotificationPreferencesSummary> {
    await this.assertAdminOver(request, userId);
    return this.preferencesService.summary(userId);
  }

  @Delete(':userId/notification-preferences')
  @HttpCode(204)
  async resetForUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    const actorUserId = await this.assertAdminOver(request, userId);
    await this.preferencesService.reset(userId);
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.notificationPreferencesReset,
      entityType: auditLogEntityTypes.user,
      entityId: userId,
      actorUserId,
      metadata: {} as never,
    });
  }

  private async caller(request: AuthenticatedHttpRequest) {
    const principal = readAuthenticatedPrincipal(request);
    if (principal === null) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
    }
    const context = await this.authorizationContextLoader.loadBySubjectId(principal.subjectId);
    const rank = highestRoleRank(
      context?.assignments.map((assignment) => assignment.roleKey) ?? [],
      context?.isSuperAdmin === true,
    );
    return { userId: principal.subjectId, rank };
  }

  /** ADMIN+ only; an ADMIN cannot touch a SUPER_ADMIN (same rule as /users). */
  private async assertAdminOver(request: AuthenticatedHttpRequest, targetUserId: string): Promise<string> {
    const principal = readAuthenticatedPrincipal(request);
    const actorUserId = principal?.subjectId ?? '';
    const [actor, target] = await Promise.all([
      this.authorizationContextLoader.loadBySubjectId(actorUserId),
      this.authorizationContextLoader.loadBySubjectId(targetUserId),
    ]);
    const actorIsAdmin =
      actor?.isSuperAdmin === true ||
      (actor?.assignments ?? []).some(
        (assignment) =>
          assignment.roleKey === authorizationRoleKeys.admin ||
          assignment.roleKey === authorizationRoleKeys.superAdmin,
      );
    if (!actorIsAdmin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
    }
    if (target === null) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    assertCanManageTargetUser({
      actorIsSuperAdmin: actor?.isSuperAdmin === true,
      targetIsSuperAdmin: target.isSuperAdmin,
    });
    return actorUserId;
  }

  private async claimTestSlot(userId: string): Promise<boolean> {
    const key = `notifications:test-digest:${userId}`;
    if (this.redis !== undefined && this.redis.status === 'ready') {
      try {
        return (await this.redis.set(key, '1', 'EX', testDigestWindowSeconds, 'NX')) === 'OK';
      } catch {
        // fall through to the per-instance guard
      }
    }
    const now = Date.now();
    const last = this.localTestSends.get(userId) ?? 0;
    if (now - last < testDigestWindowSeconds * 1000) return false;
    this.localTestSends.set(userId, now);
    return true;
  }
}

function mapPreferencesError(error: unknown): never {
  if (error instanceof NotificationPreferencesError) {
    if (error.code === 'NOTIFICATION_PREFERENCES_DISABLED') {
      throw new ForbiddenException({ code: error.code, message: 'Personal preferences are disabled' });
    }
    throw new BadRequestException({ code: error.code, message: 'Invalid preferences', details: error.details });
  }
  throw error;
}
