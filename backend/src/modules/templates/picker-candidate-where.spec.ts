import {
  pickerOffScopeWhere,
  pickerScopeScores,
  pickerScopeTierWhere,
  pickerScopeWhere,
} from './picker-candidate-where';

describe('picker candidate scope (Val 3, M13/B2)', () => {
  it('keeps a ticket-less picker on global templates only', () => {
    expect(pickerScopeWhere(null)).toEqual({
      services: { none: {} },
      categories: { none: {} },
      groups: { none: {} },
    });
    expect(pickerOffScopeWhere(null)).toEqual({
      OR: [{ services: { some: {} } }, { categories: { some: {} } }, { groups: { some: {} } }],
    });
  });

  it('fetches global and ticket-matching templates as eligible', () => {
    const where = pickerScopeWhere({
      serviceId: 's1',
      categoryId: 'c1',
      assignedGroupId: 'g1',
    });
    expect(where).toEqual({
      OR: [
        {
          services: { none: {} },
          categories: { none: {} },
          groups: { none: {} },
        },
        { services: { some: { serviceId: 's1' } } },
        { categories: { some: { categoryId: 'c1' } } },
        { groups: { some: { groupId: 'g1' } } },
      ],
    });
  });

  it('skips missing ticket facts instead of matching null', () => {
    const where = pickerScopeWhere({
      serviceId: 's1',
      categoryId: null,
      assignedGroupId: null,
    });
    expect(where).toEqual({
      OR: [
        {
          services: { none: {} },
          categories: { none: {} },
          groups: { none: {} },
        },
        { services: { some: { serviceId: 's1' } } },
      ],
    });
  });

  it('describes scoped-elsewhere rows without touching eligible ones', () => {
    const where = pickerOffScopeWhere({
      serviceId: 's1',
      categoryId: 'c1',
      assignedGroupId: null,
    });
    expect(where).toEqual({
      AND: [
        {
          OR: [{ services: { some: {} } }, { categories: { some: {} } }, { groups: { some: {} } }],
        },
        { services: { none: { serviceId: 's1' } } },
        { categories: { none: { categoryId: 'c1' } } },
      ],
    });
  });

  it('creates disjoint, relevance-ordered scope tiers for keyset paging', () => {
    const facts = { serviceId: 's1', categoryId: 'c1', assignedGroupId: 'g1' };
    expect(pickerScopeScores(facts, true)).toEqual([3, 2, 1, 0, -1]);
    expect(pickerScopeTierWhere(facts, 3)).toEqual({
      services: { some: { serviceId: 's1' } },
    });
    expect(pickerScopeTierWhere(facts, 2)).toEqual({
      services: { none: { serviceId: 's1' } },
      categories: { some: { categoryId: 'c1' } },
    });
    expect(pickerScopeTierWhere(facts, 1)).toEqual({
      services: { none: { serviceId: 's1' } },
      categories: { none: { categoryId: 'c1' } },
      groups: { some: { groupId: 'g1' } },
    });
    expect(pickerScopeTierWhere(facts, 0)).toEqual({
      services: { none: {} },
      categories: { none: {} },
      groups: { none: {} },
    });
    expect(pickerScopeTierWhere(null, -1)).toEqual(pickerOffScopeWhere(null));
  });
});
