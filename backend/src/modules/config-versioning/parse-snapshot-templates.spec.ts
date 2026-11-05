import { parseTemplatesSection } from './parse-snapshot-templates';
import { ConfigVersioningError } from './config-versioning.error';
import { configVersioningErrorCodes } from './config-versioning.constants';

const validSection = () => ({
  responseTemplates: [
    {
      id: 'template-1',
      name: 'VPN reply',
      bodyBs: 'Pozdrav {ticketNumber}',
      bodyEn: 'Hello {ticketNumber}',
      kind: 'REPLY',
      tags: ['support'],
      isActive: true,
      deletedAt: null,
      scope: {
        serviceIds: ['service-1'],
        categoryIds: ['category-1'],
        groupIds: ['group-1'],
      },
    },
  ],
  playbooks: [
    {
      id: 'playbook-1',
      name: 'VPN checklist',
      description: 'Steps for VPN access',
      isActive: true,
      version: 3,
      deletedAt: null,
      scope: { serviceIds: ['service-1'], categoryIds: ['category-1'] },
      steps: [
        {
          stepKey: 'verify_access',
          position: 0,
          title: 'Verify access',
          instructions: 'Check the user account.',
          required: true,
          knowledgeArticleId: 'article-1',
          responseTemplateId: 'template-1',
        },
      ],
    },
  ],
});

describe('parseTemplatesSection (BA-templates-06)', () => {
  it('round-trips template scopes, playbook scopes, ordered steps and revision', () => {
    const section = validSection();

    expect(parseTemplatesSection(section)).toEqual(section);
  });

  it('accepts legacy header-only snapshots without clearing absent scope or steps', () => {
    const parsed = parseTemplatesSection({
      responseTemplates: [
        {
          id: 'template-1',
          name: 'VPN reply',
          bodyBs: 'Pozdrav',
          bodyEn: null,
          kind: 'ANY',
          tags: [],
          isActive: true,
          deletedAt: null,
        },
      ],
      playbooks: [
        {
          id: 'playbook-1',
          name: 'VPN checklist',
          description: null,
          isActive: true,
          deletedAt: null,
        },
      ],
    });

    expect(parsed.responseTemplates[0]?.scope).toBeUndefined();
    expect(parsed.playbooks[0]?.scope).toBeUndefined();
    expect(parsed.playbooks[0]?.steps).toBeUndefined();
    expect(parsed.playbooks[0]?.version).toBeUndefined();
  });

  it.each([
    ['duplicate response-template id', (section: ReturnType<typeof validSection>) => {
      section.responseTemplates.push({ ...section.responseTemplates[0]!, name: 'Other reply' });
    }],
    ['blank response-template id', (section: ReturnType<typeof validSection>) => {
      section.responseTemplates[0]!.id = '  ';
    }],
    ['duplicate scope reference', (section: ReturnType<typeof validSection>) => {
      section.responseTemplates[0]!.scope!.serviceIds = ['service-1', 'service-1'];
    }],
    ['blank scope reference', (section: ReturnType<typeof validSection>) => {
      section.responseTemplates[0]!.scope!.groupIds = ['  '];
    }],
    ['unknown response-template kind', (section: ReturnType<typeof validSection>) => {
      section.responseTemplates[0]!.kind = 'PUBLIC';
    }],
    ['invalid playbook revision', (section: ReturnType<typeof validSection>) => {
      section.playbooks[0]!.version = 0;
    }],
    ['duplicate step key', (section: ReturnType<typeof validSection>) => {
      section.playbooks[0]!.steps!.push({
        ...section.playbooks[0]!.steps![0]!,
        position: 1,
      });
    }],
    ['non-contiguous step order', (section: ReturnType<typeof validSection>) => {
      section.playbooks[0]!.steps![0]!.position = 1;
    }],
    ['empty playbook steps', (section: ReturnType<typeof validSection>) => {
      section.playbooks[0]!.steps = [];
    }],
    ['wrong step field type', (section: ReturnType<typeof validSection>) => {
      Object.assign(section.playbooks[0]!.steps![0]!, { required: 'yes' });
    }],
    ['invalid deletion timestamp', (section: ReturnType<typeof validSection>) => {
      Object.assign(section.playbooks[0]!, { deletedAt: 'not-a-date' });
    }],
    ['duplicate live response-template name', (section: ReturnType<typeof validSection>) => {
      section.responseTemplates.push({ ...section.responseTemplates[0]!, id: 'template-2', name: 'vpn REPLY' });
    }],
    ['duplicate live playbook name', (section: ReturnType<typeof validSection>) => {
      section.playbooks.push({ ...section.playbooks[0]!, id: 'playbook-2', name: 'vpn CHECKLIST' });
    }],
  ])('rejects %s', (_label, mutate) => {
    const section = validSection();
    mutate(section);

    expect(() => parseTemplatesSection(section)).toThrow(ConfigVersioningError);
    expect(() => parseTemplatesSection(section)).toThrow(
      expect.objectContaining({ code: configVersioningErrorCodes.invalidSnapshot }),
    );
  });
});
