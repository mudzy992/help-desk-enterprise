import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrivacyNoticeAdminController } from './privacy-notice-admin.controller';
import { PrivacyNoticeLocaleQueryDto, UpdatePrivacyNoticeDto } from './privacy-notice-admin.dto';
import { privacyNoticeMaxLength } from '../../settings/definitions/privacy-settings';
import { settingKeys } from '../../settings/setting-keys';

const configurationLoader = { load: jest.fn() };
const recordService = { build: jest.fn() };
const settingsService = { setSettingValues: jest.fn() };

const controller = new PrivacyNoticeAdminController(
  configurationLoader as never,
  recordService as never,
  settingsService as never,
);

describe('PrivacyNoticeAdminController (5.3.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configurationLoader.load.mockResolvedValue({ enabled: true, notice: { bs: 'bs text', en: 'en text' } });
  });

  it('reports the module state, both raw texts and the shared limit', async () => {
    await expect(controller.status()).resolves.toEqual({
      enabled: true,
      maxLength: privacyNoticeMaxLength,
      notice: { bs: 'bs text', en: 'en text' },
    });
  });

  it('builds the draft from the processing record for the requested locale', async () => {
    recordService.build.mockResolvedValue({ locale: 'en', sections: [] });
    const result = await controller.draft({ locale: 'en' });
    expect(recordService.build).toHaveBeenCalledWith('en');
    expect(result.locale).toBe('en');
    expect(typeof result.markdown).toBe('string');
  });

  it('defaults the draft locale to Bosnian', async () => {
    recordService.build.mockResolvedValue({ locale: 'bs', sections: [] });
    await controller.draft(new PrivacyNoticeLocaleQueryDto());
    expect(recordService.build).toHaveBeenCalledWith('bs');
  });

  it('saves both languages in one settings transaction and returns the fresh status', async () => {
    settingsService.setSettingValues.mockResolvedValue({ updatedKeys: [], resets: [] });
    const result = await controller.update({ bs: 'novo', en: 'new' }, { user: { id: 'u1' } } as never);
    expect(settingsService.setSettingValues).toHaveBeenCalledWith(
      [
        { key: settingKeys.privatePrivacyNoticeBs, value: 'novo' },
        { key: settingKeys.privatePrivacyNoticeEn, value: 'new' },
      ],
      expect.objectContaining({ actorUserId: 'u1' }),
    );
    expect(result.notice).toEqual({ bs: 'bs text', en: 'en text' });
  });

  it('rejects a notice over the shared 20,000-character limit', async () => {
    const dto = plainToInstance(UpdatePrivacyNoticeDto, {
      bs: 'x'.repeat(privacyNoticeMaxLength + 1),
      en: '',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'bs')).toBe(true);
  });

  it('accepts an empty notice (the language falls back to the generated draft)', async () => {
    const dto = plainToInstance(UpdatePrivacyNoticeDto, { bs: '', en: 'ok' });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('limits the draft locale query to bs/en', async () => {
    await expect(
      validate(plainToInstance(PrivacyNoticeLocaleQueryDto, { locale: 'de' })),
    ).resolves.not.toEqual([]);
    await expect(
      validate(plainToInstance(PrivacyNoticeLocaleQueryDto, { locale: 'en' })),
    ).resolves.toEqual([]);
  });
});
