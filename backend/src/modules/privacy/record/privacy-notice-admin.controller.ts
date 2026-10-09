import { Body, Controller, Get, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { permissionKeys } from '../../authorization/authorization.constants';
import { RequirePermissions } from '../../authorization/require-permissions.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { mapSettingsError } from '../../settings/map-settings-error';
import { readSettingsActorUserId } from '../../settings/read-settings-actor-user-id';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { privacyNoticeMaxLength } from '../../settings/definitions/privacy-settings';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import { PrivacyNoticeLocaleQueryDto, UpdatePrivacyNoticeDto } from './privacy-notice-admin.dto';
import { buildNoticeDraft } from './privacy-notice';
import { ProcessingRecordService, type RecordLocale } from './processing-record.service';

/**
 * 5.3.7 (§4.7 — privatnost): the dedicated notice editor API. The public
 * `GET /privacy/notice` stays unauthenticated; these endpoints need
 * `privacy.manage` (SUPER_ADMIN today) and write the same two setting keys
 * the settings registry exposes, so both paths stay consistent.
 */
@Controller('privacy/notice')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PrivacyNoticeAdminController {
  constructor(
    private readonly configurationLoader: PrivacyConfigurationLoader,
    private readonly recordService: ProcessingRecordService,
    private readonly settingsService: SettingsService,
  ) {}

  /** What the editor opens with: module state, both raw texts and the limit. */
  @Get('status')
  @RequirePermissions(permissionKeys.privacyManage)
  async status() {
    const configuration = await this.configurationLoader.load();
    return {
      enabled: configuration.enabled,
      maxLength: privacyNoticeMaxLength,
      notice: { bs: configuration.notice.bs, en: configuration.notice.en },
    };
  }

  /** The draft the public page would show for a locale with no saved text. */
  @Get('draft')
  @RequirePermissions(permissionKeys.privacyManage)
  async draft(@Query() query: PrivacyNoticeLocaleQueryDto) {
    const locale: RecordLocale = query.locale === 'en' ? 'en' : 'bs';
    const record = await this.recordService.build(locale);
    return { locale, markdown: buildNoticeDraft(record) };
  }

  /** Saves both languages in one transaction; empty text returns to the draft. */
  @Put()
  @RequirePermissions(permissionKeys.privacyManage)
  async update(@Body() body: UpdatePrivacyNoticeDto, @Req() request: AuthenticatedHttpRequest) {
    try {
      await this.settingsService.setSettingValues(
        [
          { key: settingKeys.privatePrivacyNoticeBs, value: body.bs },
          { key: settingKeys.privatePrivacyNoticeEn, value: body.en },
        ],
        { reason: 'Privacy notice updated in the privacy module editor', actorUserId: readSettingsActorUserId(request) },
      );
    } catch (error) {
      throw mapSettingsError(error);
    }
    return this.status();
  }
}
