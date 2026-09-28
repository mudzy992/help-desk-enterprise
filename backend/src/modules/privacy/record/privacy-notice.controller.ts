import { Controller, Get, Header, NotFoundException, Query } from '@nestjs/common';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import { ProcessingRecordService } from './processing-record.service';
import { resolvePrivacyNotice, type PrivacyNotice } from './privacy-notice';

/**
 * Paket 2.6 (§8, čl. 15): the privacy notice is public — linked from the
 * login page before anyone signs in. Contains only what the controller
 * publishes anyway (no user data); cached briefly by the browser.
 */
@Controller('privacy/notice')
export class PrivacyNoticeController {
  constructor(
    private readonly configurationLoader: PrivacyConfigurationLoader,
    private readonly recordService: ProcessingRecordService,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async notice(@Query('locale') locale?: string): Promise<PrivacyNotice> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) throw new NotFoundException({ code: 'PRIVACY_DISABLED', message: 'Not found' });
    const resolved = locale === 'en' ? 'en' : 'bs';
    return resolvePrivacyNotice(configuration, resolved, () => this.recordService.build(resolved));
  }
}
