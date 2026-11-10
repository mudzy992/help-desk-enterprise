import { createConfigSnapshotFixture } from '../create-config-snapshot-fixture';
import type { ConfigSnapshot } from '../config-versioning.types';
import { buildPortableConfig, PortableConfigBuildError } from './build-portable-config';
import {
  canonicalJson,
  computeConfigPackageChecksum,
  signConfigPackageChecksum,
  verifyConfigPackageSignature,
} from './config-package-integrity';
import type { ConfigPackageHeader, ConfigReferenceIndex } from './config-package.types';
import { ConfigPackageFormatError, parseConfigPackage } from './parse-config-package';
import { parseConfigPackageMappings } from './parse-import-options';
import { resolvePortableConfig } from './resolve-portable-config';

const sourceIndex: ConfigReferenceIndex = {
  organizationalUnits: [{ id: 'ou-root', key: '/Org' }],
  groups: [{ id: 'group-it', key: 'IT' }],
  services: [{ id: 'service-vpn', key: 'vpn' }],
  serviceCategories: [{ id: 'cat-1', key: 'network' }],
  policyPacks: [],
  calendars: [{ id: 'cal-1', key: 'BH_STANDARD' }],
  slaProfiles: [{ id: 'profile-1', key: 'INCIDENT' }],
  responseTemplates: [],
  playbooks: [],
  knowledgeArticles: [],
  formVersions: [{ id: 'form-1', key: 'vpn@1' }],
};

/** Same organisation on "production": every id differs. */
function productionSnapshot(): ConfigSnapshot {
  const base = createConfigSnapshotFixture();
  return {
    ...base,
    settings: { 'private.ticket.unroutedQueue.enabled': false, 'private.smtp.host': 'mail.prod.example.com' },
    routing: { ...base.routing, rules: [{ id: 'p-rule', originUnitId: 'p-ou', serviceId: 'p-vpn', groupId: 'p-it' }] },
    sla: {
      ...base.sla,
      calendars: base.sla.calendars.map((calendar) => ({ ...calendar, id: 'p-cal' })),
      profiles: base.sla.profiles.map((profile) => ({ ...profile, id: 'p-profile', calendarId: 'p-cal' })),
      rules: base.sla.rules.map((rule) => ({ ...rule, id: `p-${rule.id}`, slaProfileId: 'p-profile', responseMinutes: 60 })),
      priorityMatrix: base.sla.priorityMatrix.map((rule) => ({ ...rule, id: `p-${rule.id}` })),
    },
    catalog: {
      services: base.catalog.services.map((service) => ({
        ...service,
        id: 'p-vpn',
        categoryId: 'p-cat',
        slaProfileId: 'p-profile',
        name: 'VPN (old)',
      })),
    },
    forms: { versions: base.forms.versions.map((form) => ({ ...form, id: 'p-form', serviceId: 'p-vpn' })) },
    references: { organizationalUnits: [{ id: 'p-ou', parentId: null, ouPath: '/Org' }], groups: [{ id: 'p-it' }] },
  };
}

const productionIndex: ConfigReferenceIndex = {
  organizationalUnits: [{ id: 'p-ou', key: '/Org' }],
  groups: [{ id: 'p-it', key: 'IT' }],
  services: [{ id: 'p-vpn', key: 'vpn' }],
  serviceCategories: [{ id: 'p-cat', key: 'network' }],
  policyPacks: [],
  calendars: [{ id: 'p-cal', key: 'BH_STANDARD' }],
  slaProfiles: [{ id: 'p-profile', key: 'INCIDENT' }],
  responseTemplates: [],
  playbooks: [],
  knowledgeArticles: [],
  formVersions: [{ id: 'p-form', key: 'vpn@1' }],
};

const isSecret = (key: string) => key === 'private.auth.jwtSigningSecret';
let counter = 0;
const resolveInput = (overrides: Partial<Parameters<typeof resolvePortableConfig>[0]> = {}) => ({
  content: buildPortableConfig(
    createConfigSnapshotFixture({
      settings: {
        'private.ticket.unroutedQueue.enabled': true,
        'private.smtp.host': 'mail.staging.example.com',
        'private.auth.jwtSigningSecret': 'x',
      },
    }),
    sourceIndex,
    { includeEnvironmentBound: true, isSecret },
  ),
  target: productionSnapshot(),
  index: productionIndex,
  mappings: {},
  applyEnvironmentBound: false,
  isKnownSetting: () => true,
  isSecret,
  newId: () => `new-${(counter += 1)}`,
  capturedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('config package (Paket 2.9 K4)', () => {
  it('exports natural keys only, never secrets, env-bound settings only on request', () => {
    const snapshot = createConfigSnapshotFixture({
      settings: { 'private.smtp.host': 'mail.example.com', 'private.auth.jwtSigningSecret': 'x', 'private.ticket.a': 1 },
    });
    const without = buildPortableConfig(snapshot, sourceIndex, { includeEnvironmentBound: false, isSecret });
    expect(without.settings).toEqual({ 'private.ticket.a': 1 });
    expect(without.routing.rules).toEqual([{ originUnit: '/Org', service: 'vpn', group: 'IT' }]);
    expect(without.catalog.services[0]).toMatchObject({ slug: 'vpn', category: 'network', slaProfile: 'INCIDENT' });
    expect(without.forms.versions[0]).toMatchObject({ service: 'vpn', version: 1 });
    expect(JSON.stringify(without)).not.toMatch(/service-vpn|group-it|ou-root|cal-1|profile-1|cat-1/);
    const withBound = buildPortableConfig(snapshot, sourceIndex, { includeEnvironmentBound: true, isSecret });
    expect(Object.keys(withBound.settings).sort()).toEqual(['private.smtp.host', 'private.ticket.a']);
  });

  it('refuses to export a snapshot with a dangling source id', () => {
    expect(() =>
      buildPortableConfig(createConfigSnapshotFixture(), { ...sourceIndex, groups: [] }, {
        includeEnvironmentBound: false,
        isSecret,
      }),
    ).toThrow(PortableConfigBuildError);
  });

  it('translates to target ids, reuses matching rows and keeps env-bound target values', () => {
    const result = resolvePortableConfig(resolveInput());
    expect(result.blockingCount).toBe(0);
    const snapshot = result.snapshot!;
    expect(snapshot.routing.rules).toEqual([{ id: 'p-rule', originUnitId: 'p-ou', serviceId: 'p-vpn', groupId: 'p-it' }]);
    expect(snapshot.sla.rules.map((rule) => rule.id).sort()).toEqual(
      ['p-rule-CRITICAL', 'p-rule-HIGH', 'p-rule-LOW', 'p-rule-MEDIUM'],
    );
    expect(snapshot.sla.rules.every((rule) => rule.responseMinutes === 30 && rule.slaProfileId === 'p-profile')).toBe(true);
    expect(snapshot.catalog.services[0]).toMatchObject({ id: 'p-vpn', name: 'VPN', categoryId: 'p-cat' });
    expect(snapshot.settings['private.ticket.unroutedQueue.enabled']).toBe(true);
    expect(snapshot.settings['private.smtp.host']).toBe('mail.prod.example.com');
    expect(snapshot.settings['private.auth.jwtSigningSecret']).toBeUndefined();
    expect(snapshot.routing.configuration.unroutedQueueEnabled).toBe(true);
    expect(result.settings.skippedEnvironmentBound).toEqual(['private.smtp.host']);
    expect(result.created).toEqual({ calendars: [], slaProfiles: [] });
  });

  it('preserves the target catalog concurrency hash while overlaying portable values', () => {
    const targetHash = 'c'.repeat(64);
    const result = resolvePortableConfig(
      resolveInput({
        target: { ...productionSnapshot(), catalogStateHash: targetHash },
      }),
    );

    expect(result.snapshot?.catalogStateHash).toBe(targetHash);
  });

  it('applies env-bound settings only when confirmed', () => {
    const result = resolvePortableConfig(resolveInput({ applyEnvironmentBound: true }));
    expect(result.snapshot!.settings['private.smtp.host']).toBe('mail.staging.example.com');
  });

  it('blocks on a missing group until it is mapped, and never creates it', () => {
    const index = { ...productionIndex, groups: [{ id: 'p-helpdesk', key: 'HELPDESK' }] };
    const blocked = resolvePortableConfig(resolveInput({ index }));
    expect(blocked.snapshot).toBeNull();
    expect(blocked.items).toContainEqual(
      expect.objectContaining({ kind: 'group', key: 'IT', status: 'missing', blocking: true, usedBy: ['routing.rules[0]'] }),
    );
    const mapped = resolvePortableConfig(resolveInput({ index, mappings: { group: { IT: 'p-helpdesk' } } }));
    expect(mapped.snapshot!.routing.rules[0]!.groupId).toBe('p-helpdesk');
    expect(mapped.items).toContainEqual(expect.objectContaining({ kind: 'group', key: 'IT', status: 'mapped' }));
    const wrongMapping = resolvePortableConfig(resolveInput({ index, mappings: { group: { IT: 'does-not-exist' } } }));
    expect(wrongMapping.snapshot).toBeNull();
  });

  it('creates missing SLA calendars/profiles and skips services absent on the target', () => {
    const index = { ...productionIndex, calendars: [], slaProfiles: [], services: [], formVersions: [] };
    const target = productionSnapshot();
    const result = resolvePortableConfig(
      resolveInput({
        index: { ...index, services: [] },
        target: { ...target, sla: { ...target.sla, calendars: [], profiles: [] }, catalog: { services: [] }, forms: { versions: [] } },
        mappings: { service: {} },
      }),
    );
    expect(result.created).toEqual({ calendars: ['BH_STANDARD'], slaProfiles: ['INCIDENT'] });
    expect(result.skipped.services).toEqual(['vpn']);
    expect(result.skipped.formVersions).toEqual(['vpn@1']);
    // The routing rule still needs the service → blocking.
    expect(result.items).toContainEqual(expect.objectContaining({ kind: 'service', key: 'vpn', blocking: true }));
  });

  it('exports, parses and resolves complete template scopes and playbook steps by natural key', () => {
    const sourceIndexWithTemplates: ConfigReferenceIndex = {
      ...sourceIndex,
      responseTemplates: [{ id: 'template-1', key: 'VPN reply' }],
      playbooks: [{ id: 'playbook-1', key: 'VPN checklist' }],
      knowledgeArticles: [{ id: 'article-1', key: 'vpn-setup' }],
    };
    const source = createConfigSnapshotFixture({
      templates: {
        responseTemplates: [{
          id: 'template-1',
          name: 'VPN reply',
          bodyBs: 'Pozdrav {ticketNumber}',
          bodyEn: null,
          kind: 'REPLY',
          tags: ['support'],
          isActive: true,
          deletedAt: null,
          scope: { serviceIds: ['service-vpn'], categoryIds: ['cat-1'], groupIds: ['group-it'] },
        }],
        playbooks: [{
          id: 'playbook-1',
          name: 'VPN checklist',
          description: 'VPN setup steps',
          isActive: true,
          version: 5,
          deletedAt: null,
          scope: { serviceIds: ['service-vpn'], categoryIds: ['cat-1'] },
          steps: [{
            stepKey: 'verify_access',
            position: 0,
            title: 'Verify access',
            instructions: null,
            required: true,
            knowledgeArticleId: 'article-1',
            responseTemplateId: 'template-1',
          }],
        }],
      },
    });
    const content = buildPortableConfig(source, sourceIndexWithTemplates, {
      includeEnvironmentBound: false,
      isSecret,
    });
    expect(content.templates).toEqual({
      responseTemplates: [{
        name: 'VPN reply',
        bodyBs: 'Pozdrav {ticketNumber}',
        bodyEn: null,
        kind: 'REPLY',
        tags: ['support'],
        isActive: true,
        deletedAt: null,
        scope: { services: ['vpn'], categories: ['network'], groups: ['IT'] },
      }],
      playbooks: [{
        name: 'VPN checklist',
        description: 'VPN setup steps',
        isActive: true,
        deletedAt: null,
        version: 5,
        scope: { services: ['vpn'], categories: ['network'] },
        steps: [{
          stepKey: 'verify_access',
          position: 0,
          title: 'Verify access',
          instructions: null,
          required: true,
          knowledgeArticle: 'vpn-setup',
          responseTemplate: 'VPN reply',
        }],
      }],
    });

    const header: ConfigPackageHeader = {
      format: 'helpdesk-config-package',
      formatVersion: 1,
      appVersion: '',
      sourceEnvironment: 'staging',
      sourceVersion: 4,
      exportedAt: '2026-10-01T00:00:00.000Z',
      includesEnvironmentBound: false,
    };
    const checksum = computeConfigPackageChecksum(header, content);
    const parsed = parseConfigPackage({ ...header, content, checksum, signature: null });
    expect(parsed.content.templates).toEqual(content.templates);

    const target = {
      ...productionSnapshot(),
      templates: {
        responseTemplates: [{
          id: 'p-template',
          name: 'VPN reply',
          bodyBs: 'Old reply',
          bodyEn: null,
          kind: 'ANY' as const,
          tags: [],
          isActive: true,
          deletedAt: null,
          scope: { serviceIds: ['p-vpn'], categoryIds: ['p-cat'], groupIds: ['p-it'] },
        }],
        playbooks: [{
          id: 'p-playbook',
          name: 'VPN checklist',
          description: null,
          isActive: true,
          version: 7,
          deletedAt: null,
          scope: { serviceIds: ['p-vpn'], categoryIds: ['p-cat'] },
          steps: [{
            stepKey: 'old-step',
            position: 0,
            title: 'Old step',
            instructions: null,
            required: true,
            knowledgeArticleId: null,
            responseTemplateId: null,
          }],
        }],
      },
    };
    const targetIndex: ConfigReferenceIndex = {
      ...productionIndex,
      services: [...productionIndex.services, { id: 'a-service', key: 'vpn-2' }],
      responseTemplates: [{ id: 'p-template', key: 'VPN reply' }],
      playbooks: [{ id: 'p-playbook', key: 'VPN checklist' }],
      knowledgeArticles: [{ id: 'p-article', key: 'vpn-setup' }],
    };
    const portableTemplates = parsed.content.templates!;
    const portableContent = {
      ...parsed.content,
      templates: {
        ...portableTemplates,
        responseTemplates: portableTemplates.responseTemplates.map((template) => ({
          ...template,
          scope: { ...template.scope!, services: ['vpn', 'vpn-2'] },
        })),
        playbooks: portableTemplates.playbooks.map((playbook) => ({
          ...playbook,
          scope: { ...playbook.scope!, services: ['vpn', 'vpn-2'] },
        })),
      },
    };
    const resolved = resolvePortableConfig({
      content: portableContent,
      target,
      index: targetIndex,
      mappings: {},
      applyEnvironmentBound: false,
      isKnownSetting: () => true,
      isSecret,
      newId: () => 'unused-new-id',
      capturedAt: '2026-10-02T00:00:00.000Z',
    });
    expect(resolved.blockingCount).toBe(0);
    expect(resolved.snapshot?.templates?.responseTemplates[0]).toMatchObject({
      id: 'p-template',
      scope: { serviceIds: ['a-service', 'p-vpn'], categoryIds: ['p-cat'], groupIds: ['p-it'] },
    });
    expect(resolved.snapshot?.templates?.playbooks[0]).toMatchObject({
      id: 'p-playbook',
      version: 7,
      scope: { serviceIds: ['a-service', 'p-vpn'], categoryIds: ['p-cat'] },
      steps: [{
        stepKey: 'verify_access',
        position: 0,
        title: 'Verify access',
        knowledgeArticleId: 'p-article',
        responseTemplateId: 'p-template',
      }],
    });

    const contentTemplates = content.templates!;
    const malformedContent = {
      ...content,
      templates: {
        ...contentTemplates,
        playbooks: contentTemplates.playbooks.map((playbook) => ({
          ...playbook,
          steps: [...playbook.steps!, { ...playbook.steps![0]!, position: 1 }],
        })),
      },
    };
    expect(() => parseConfigPackage({
      ...header,
      content: malformedContent,
      checksum: 'a'.repeat(64),
      signature: null,
    })).toThrow(ConfigPackageFormatError);
  });

  it('checksums canonically and verifies HMAC signatures', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    const header: ConfigPackageHeader = {
      format: 'helpdesk-config-package',
      formatVersion: 1,
      appVersion: '',
      sourceEnvironment: 'staging',
      sourceVersion: 3,
      exportedAt: '2026-10-01T00:00:00.000Z',
      includesEnvironmentBound: false,
    };
    const content = resolveInput().content;
    const checksum = computeConfigPackageChecksum(header, content);
    expect(computeConfigPackageChecksum({ ...header }, JSON.parse(JSON.stringify(content)))).toBe(checksum);
    expect(computeConfigPackageChecksum({ ...header, sourceVersion: 4 }, content)).not.toBe(checksum);
    const key = 'k'.repeat(32);
    const signature = signConfigPackageChecksum(checksum, key);
    expect(verifyConfigPackageSignature(checksum, signature, key)).toBe('valid');
    expect(verifyConfigPackageSignature(checksum, signature, 'z'.repeat(32))).toBe('invalid');
    expect(verifyConfigPackageSignature(checksum, null, key)).toBe('unsigned');
    expect(verifyConfigPackageSignature(checksum, signature, null)).toBe('no_key');

    const pkg = { ...header, content, checksum, signature };
    expect(parseConfigPackage(JSON.parse(JSON.stringify(pkg))).content).toEqual(content);
    expect(() => parseConfigPackage({ ...pkg, format: 'other' })).toThrow(ConfigPackageFormatError);
    expect(() => parseConfigPackage({ ...pkg, content: { ...content, routing: { rules: [{}] } } })).toThrow(
      ConfigPackageFormatError,
    );
  });

  it('accepts mappings only for mappable kinds', () => {
    expect(parseConfigPackageMappings('{"group":{"IT":"g1"}}')).toEqual({ group: { IT: 'g1' } });
    expect(parseConfigPackageMappings(undefined)).toEqual({});
    expect(() => parseConfigPackageMappings('{"formVersion":{"a":"b"}}')).toThrow();
    expect(() => parseConfigPackageMappings('not json')).toThrow();
  });
});
