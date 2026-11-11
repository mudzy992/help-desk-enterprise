import { BadRequestException } from '@nestjs/common';
import {
  afterTemplatePickerCursor,
  afterTemplatesNameCursor,
  decodeTemplatePickerCursor,
  decodeTemplatesNameCursor,
  decodeTemplatesTierNameCursor,
  encodeTemplatePickerCursor,
  encodeTemplatesNameCursor,
  encodeTemplatesTierNameCursor,
  templatesCursorKinds,
  templatesFilterKey,
  templatesPageLimit,
} from './templates-pagination';

describe('templates pagination primitives', () => {
  it('applies the bounded page-size default and maximum', () => {
    expect(templatesPageLimit(undefined)).toBe(50);
    expect(templatesPageLimit(25)).toBe(25);
    expect(templatesPageLimit(500)).toBe(100);
    expect(templatesPageLimit(0)).toBe(1);
  });

  it('binds stable cursors to the requested filter and resource kind', () => {
    const filterKey = templatesFilterKey({ ownership: 'shared', q: 'printer' });
    expect(templatesFilterKey({ ownership: 'shared', q: 'printer' })).toBe(filterKey);
    const cursor = { name: 'Printer help', id: 'template-2', filterKey };
    const encoded = encodeTemplatesNameCursor(templatesCursorKinds.managedResponseTemplates, cursor);
    expect(decodeTemplatesNameCursor(encoded, templatesCursorKinds.managedResponseTemplates, filterKey)).toEqual(
      cursor,
    );
    expect(() => decodeTemplatesNameCursor(encoded, templatesCursorKinds.managedPlaybooks, filterKey)).toThrow(
      BadRequestException,
    );
    expect(() =>
      decodeTemplatesNameCursor(encoded, templatesCursorKinds.managedResponseTemplates, 'different'),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed and non-canonical base64url cursors', () => {
    expect(() => decodeTemplatesNameCursor('not-a-cursor', 'kind', 'filter')).toThrow(BadRequestException);
    const filterKey = templatesFilterKey({ q: 'x' });
    const encoded = encodeTemplatesNameCursor('kind', {
      name: 'Name',
      id: 'id',
      filterKey,
    });
    expect(() => decodeTemplatesNameCursor(`${encoded}=`, 'kind', filterKey)).toThrow(BadRequestException);
  });

  it('validates relevance-tier and picker tuple cursors', () => {
    const filterKey = templatesFilterKey({ ticketId: 'ticket-1' });
    const candidate = {
      tier: 'category',
      name: 'Playbook',
      id: 'playbook-4',
      filterKey,
    };
    const encodedCandidate = encodeTemplatesTierNameCursor(templatesCursorKinds.ticketPlaybookCandidates, candidate);
    expect(
      decodeTemplatesTierNameCursor(encodedCandidate, templatesCursorKinds.ticketPlaybookCandidates, filterKey, [
        'service',
        'category',
        'other',
      ]),
    ).toEqual(candidate);
    expect(() =>
      decodeTemplatesTierNameCursor(encodedCandidate, templatesCursorKinds.ticketPlaybookCandidates, filterKey, [
        'service',
        'other',
      ]),
    ).toThrow(BadRequestException);

    const picker = {
      rank: 5,
      usageCount: 12,
      name: 'Network template',
      id: 'template-5',
      filterKey,
    };
    const encodedPicker = encodeTemplatePickerCursor(picker);
    expect(decodeTemplatePickerCursor(encodedPicker, filterKey, [5, 4, 3])).toEqual(picker);
    expect(() => decodeTemplatePickerCursor(encodedPicker, filterKey, [4, 3])).toThrow(BadRequestException);
    expect(() => decodeTemplatePickerCursor(encodedPicker, 'wrong-filter', [5])).toThrow(BadRequestException);
  });

  it('builds strict keyset predicates with stable ID tie-breakers', () => {
    expect(afterTemplatesNameCursor({ name: 'A', id: 'id-1' })).toEqual({
      OR: [{ name: { gt: 'A' } }, { name: 'A', id: { gt: 'id-1' } }],
    });
    expect(afterTemplatePickerCursor({ usageCount: 9, name: 'A', id: 'id-1' })).toEqual({
      OR: [
        { usageCount: { lt: 9 } },
        { usageCount: 9, name: { gt: 'A' } },
        { usageCount: 9, name: 'A', id: { gt: 'id-1' } },
      ],
    });
  });
});
