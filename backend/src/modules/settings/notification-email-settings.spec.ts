import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { defaultEmailTemplates } from '../notifications/email/default-email-templates';
import { serializeEmailTemplateRegistry } from '../notifications/email/default-email-templates';
import { createInMemorySettingsPrisma } from './create-in-memory-settings-prisma';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsError } from './settings.error';
import { SettingsService } from './settings.service';
import { readEmailChannelSettings } from './read-email-channel-settings';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('notification email settings', () => {
  const createHarness = async () => {
    const memory = createInMemorySettingsPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(applicationSettings),
        },
        { provide: PrismaService, useValue: memory.prisma },
      ],
    }).compile();
    return { service: moduleRef.get(SettingsService), memory };
  };

  it('defaults the email channel off and templates to the built-in registry', async () => {
    const { service } = await createHarness();
    const snapshot = await readEmailChannelSettings(service);
    expect(snapshot).toMatchObject({
      smtpEnabled: false,
      emailAddonEnabled: false,
      channelEnabled: false,
      deliveryEnabled: false,
      templatesEnabled: true,
      internalOnly: true,
      allowedExternalDomainsCsv: '',
      allowedExternalEmailsCsv: '',
      hasSmtpTransport: false,
    });
    expect(JSON.parse(snapshot.templatesJson)).toEqual(defaultEmailTemplates);
  });

  it('persists channel flags through the settings registry with a change log', async () => {
    const { service, memory } = await createHarness();
    await service.setSettingValue(
      settingKeys.privateNotificationsEmailEnabled,
      true,
      { reason: 'Enable email notifications', actorUserId: 'admin-1' },
    );
    expect(
      await service.getSetting(settingKeys.privateNotificationsEmailEnabled),
    ).toBe(true);
    expect(memory.changeLogs).toHaveLength(1);
    expect(memory.changeLogs[0]).toMatchObject({
      entityId: settingKeys.privateNotificationsEmailEnabled,
      reason: 'Enable email notifications',
    });
  });

  it('rejects templates with unknown placeholders', async () => {
    const { service, memory } = await createHarness();
    await expect(
      service.setSettingValue(
        settingKeys.privateNotificationsTemplatesRegistryJson,
        JSON.stringify({
          ...defaultEmailTemplates,
          'ticket.created': {
            subject: 'Hi {{actorEmail}}',
            body: 'Body',
          },
        }),
        { reason: 'Unsafe template', actorUserId: 'admin-1' },
      ),
    ).rejects.toMatchObject({
      name: 'SettingsError',
      code: 'INVALID_EMAIL_TEMPLATE',
    });
    expect(memory.changeLogs).toEqual([]);
    expect(
      await service.getSetting(
        settingKeys.privateNotificationsTemplatesRegistryJson,
      ),
    ).toBe(serializeEmailTemplateRegistry(defaultEmailTemplates));
  });

  it('accepts a valid template overlay', async () => {
    const { service } = await createHarness();
    const next = {
      ...defaultEmailTemplates,
      'ticket.created': {
        subject: 'New {{ticketNumber}}',
        body: '{{ticketTitle}}',
      },
    };
    await service.setSettingValue(
      settingKeys.privateNotificationsTemplatesRegistryJson,
      serializeEmailTemplateRegistry(next),
      { reason: 'Update created template', actorUserId: 'admin-1' },
    );
    expect(
      await service.getSetting(
        settingKeys.privateNotificationsTemplatesRegistryJson,
      ),
    ).toBe(serializeEmailTemplateRegistry(next));
  });

  it('does not treat the template registry as a secret', async () => {
    const { service } = await createHarness();
    await expect(
      service.getSecretForInternalUse(
        settingKeys.privateNotificationsTemplatesRegistryJson,
      ),
    ).rejects.toBeInstanceOf(SettingsError);
  });
});
