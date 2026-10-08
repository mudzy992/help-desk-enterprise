// The DTOs are read through their decorators, so the metadata shim has to be in
// place before the modules are imported (the app sets it up in `main.ts`).
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ReadSettingDependentsQueryDto } from './dto/read-setting-dependents.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { UpdateSettingsBatchDto } from './dto/update-settings-batch.dto';
import { SettingsController } from './settings.controller';

async function validateBody<T extends object>(
  type: new () => T,
  raw: Record<string, unknown>,
) {
  return validate(plainToInstance(type, raw), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('GET /settings/dependents query contract', () => {
  it('requires a non-empty key', async () => {
    expect(await validateBody(ReadSettingDependentsQueryDto, {})).not.toHaveLength(0);
    expect(await validateBody(ReadSettingDependentsQueryDto, { key: '' })).not.toHaveLength(0);
    expect(await validateBody(ReadSettingDependentsQueryDto, { key: 7 })).not.toHaveLength(0);
    expect(
      await validateBody(ReadSettingDependentsQueryDto, { key: 'private.smtp.enabled' }),
    ).toHaveLength(0);
  });

  it('is routed under the settings controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController)).toBe('settings');
    expect(
      Reflect.getMetadata(PATH_METADATA, SettingsController.prototype.listSettingDependents),
    ).toBe('dependents');
  });
});

describe('resetDependents flag', () => {
  it('is optional on both write bodies and must be a boolean', async () => {
    expect(
      await validateBody(UpdateSettingDto, { key: 'private.smtp.enabled', value: true, reason: 'r' }),
    ).toHaveLength(0);
    expect(
      await validateBody(UpdateSettingDto, {
        key: 'private.smtp.enabled',
        value: true,
        reason: 'r',
        resetDependents: true,
      }),
    ).toHaveLength(0);
    expect(
      await validateBody(UpdateSettingDto, {
        key: 'private.smtp.enabled',
        value: true,
        reason: 'r',
        resetDependents: 'yes',
      }),
    ).not.toHaveLength(0);
    expect(
      await validateBody(UpdateSettingsBatchDto, {
        entries: [{ key: 'private.smtp.enabled', value: true }],
        reason: 'r',
        resetDependents: true,
      }),
    ).toHaveLength(0);
    expect(
      await validateBody(UpdateSettingsBatchDto, {
        entries: [{ key: 'private.smtp.enabled', value: true }],
        reason: 'r',
        resetDependents: 1,
      }),
    ).not.toHaveLength(0);
    // Unknown fields are still refused.
    expect(
      await validateBody(UpdateSettingsBatchDto, {
        entries: [{ key: 'private.smtp.enabled', value: true }],
        reason: 'r',
        resetDependents: true,
        confirmAll: true,
      }),
    ).not.toHaveLength(0);
  });
});
