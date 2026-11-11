import { classifyServiceFormPatternInventory } from './classify-service-form-pattern-inventory';

describe('classifyServiceFormPatternInventory', () => {
  it('reports all schema patterns without including their raw values', () => {
    const report = classifyServiceFormPatternInventory([
      {
        id: 'version-1',
        serviceId: 'service-1',
        version: 1,
        status: 'ACTIVE',
        schema: {
          schemaVersion: 1,
          fields: [
            { id: 'asset_tag', validation: { pattern: '^[a-z0-9-]+$' } },
            { id: 'legacy_code', validation: { pattern: '^(a+)+$' } },
          ],
        },
      },
      {
        id: 'version-2',
        serviceId: 'service-1',
        version: 2,
        status: 'RETIRED',
        schema: { schemaVersion: 1, fields: [{ id: 'empty' }] },
      },
      {
        id: 'version-3',
        serviceId: 'service-2',
        version: 1,
        status: 'DRAFT',
        schema: 'not-an-object',
      },
    ]);

    expect(report).toMatchObject({
      formVersionCount: 3,
      formsWithPatterns: 1,
      patternCount: 2,
      safePatternCount: 1,
      unsafePatternCount: 1,
      patterns: [
        {
          formVersionId: 'version-1',
          serviceId: 'service-1',
          version: 1,
          formVersionStatus: 'ACTIVE',
          fieldId: 'asset_tag',
          classification: 'SAFE',
        },
        {
          formVersionId: 'version-1',
          serviceId: 'service-1',
          version: 1,
          formVersionStatus: 'ACTIVE',
          fieldId: 'legacy_code',
          classification: 'UNSAFE',
          reason: 'UNSUPPORTED_GROUP_OR_ALTERNATION',
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('^(a+)+$');
    expect(report.patterns.every((entry) => /^[a-f0-9]{64}$/.test(entry.patternSha256))).toBe(true);
  });
});
