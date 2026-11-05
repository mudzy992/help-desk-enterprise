import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { collectConfigSnapshot } from './collect-config-snapshot';

describe('collectConfigSnapshot templates section (BA-templates-06)', () => {
  it('captures shared scopes, ordered playbook steps and the playbook revision', async () => {
    const responseTemplateFindMany = jest.fn().mockResolvedValue([
      {
        id: 'template-1',
        name: 'VPN reply',
        bodyBs: 'Pozdrav {ticketNumber}',
        bodyEn: null,
        kind: 'REPLY',
        tags: ['support'],
        isActive: true,
        deletedAt: null,
        services: [{ serviceId: 'service-2' }, { serviceId: 'service-1' }],
        categories: [{ categoryId: 'category-1' }],
        groups: [{ groupId: 'group-1' }],
      },
    ]);
    const playbookFindMany = jest.fn().mockResolvedValue([
      {
        id: 'playbook-1',
        name: 'VPN checklist',
        description: null,
        isActive: true,
        version: 4,
        deletedAt: null,
        services: [{ serviceId: 'service-2' }, { serviceId: 'service-1' }],
        categories: [{ categoryId: 'category-1' }],
        steps: [
          {
            stepKey: 'verify_access',
            position: 0,
            title: 'Verify access',
            instructions: null,
            required: true,
            knowledgeArticleId: 'article-1',
            responseTemplateId: 'template-1',
          },
          {
            stepKey: 'notify_user',
            position: 1,
            title: 'Notify the user',
            instructions: 'Send a confirmation.',
            required: false,
            knowledgeArticleId: null,
            responseTemplateId: null,
          },
        ],
      },
    ]);
    const delegateNames = [
      'routingRule',
      'businessHoursCalendar',
      'slaProfile',
      'slaRule',
      'slaEscalationRule',
      'priorityMatrixRule',
      'service',
      'formVersion',
      'organizationalUnit',
      'group',
    ];
    const prisma = Object.fromEntries(
      delegateNames.map((name) => [name, { findMany: jest.fn().mockResolvedValue([]) }]),
    ) as Record<string, unknown>;
    prisma.responseTemplate = { findMany: responseTemplateFindMany };
    prisma.playbook = { findMany: playbookFindMany };
    const settingsService = {
      getPublicSettings: jest.fn().mockResolvedValue({}),
      getPrivateSettings: jest.fn().mockResolvedValue({}),
    };

    const snapshot = await collectConfigSnapshot(
      prisma as unknown as PrismaService,
      settingsService as unknown as SettingsService,
      ['templates'],
      '2026-11-05T00:00:00.000Z',
    );

    expect(snapshot.templates?.responseTemplates).toEqual([
      {
        id: 'template-1',
        name: 'VPN reply',
        bodyBs: 'Pozdrav {ticketNumber}',
        bodyEn: null,
        kind: 'REPLY',
        tags: ['support'],
        isActive: true,
        deletedAt: null,
        scope: {
          serviceIds: ['service-1', 'service-2'],
          categoryIds: ['category-1'],
          groupIds: ['group-1'],
        },
      },
    ]);
    expect(snapshot.templates?.playbooks).toEqual([
      {
        id: 'playbook-1',
        name: 'VPN checklist',
        description: null,
        isActive: true,
        version: 4,
        deletedAt: null,
        scope: {
          serviceIds: ['service-1', 'service-2'],
          categoryIds: ['category-1'],
        },
        steps: [
          {
            stepKey: 'verify_access',
            position: 0,
            title: 'Verify access',
            instructions: null,
            required: true,
            knowledgeArticleId: 'article-1',
            responseTemplateId: 'template-1',
          },
          {
            stepKey: 'notify_user',
            position: 1,
            title: 'Notify the user',
            instructions: 'Send a confirmation.',
            required: false,
            knowledgeArticleId: null,
            responseTemplateId: null,
          },
        ],
      },
    ]);
    expect(responseTemplateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: null } }),
    );
    expect(playbookFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          version: true,
          steps: expect.objectContaining({ orderBy: [{ position: 'asc' }, { stepKey: 'asc' }] }),
        }),
      }),
    );
  });
});
