import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { SettingsError } from '../../settings/settings.error';
import type { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';

describe('EmailTemplatesController test-send rate limit', () => {
  it('returns 503 when shared Redis cannot enforce the test-send limit', async () => {
    const emailTemplates = {
      sendTest: jest
        .fn()
        .mockRejectedValue(
          new SettingsError(
            'Test e-mail sending is temporarily unavailable',
            'TEST_RATE_LIMIT_UNAVAILABLE',
          ),
        ),
    } as unknown as EmailTemplatesService;
    const controller = new EmailTemplatesController(emailTemplates);

    let failure: unknown;
    try {
      await controller.sendTest(
        { key: 'ticket.assigned', locale: 'en' },
        {} as AuthenticatedHttpRequest,
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(503);
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: 'TEST_RATE_LIMIT_UNAVAILABLE',
    });
  });
});
