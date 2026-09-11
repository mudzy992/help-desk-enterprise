import {
  selectLeastBusyAgent,
  selectRoundRobinAgent,
} from './select-auto-assign-agent';

describe('selectLeastBusyAgent', () => {
  it('selects the agent with the lowest open-ticket count', () => {
    expect(
      selectLeastBusyAgent({
        eligibleUserIds: ['user-b', 'user-a'],
        busyCountByUserId: { 'user-a': 2, 'user-b': 1 },
      }),
    ).toBe('user-b');
  });

  it('breaks ties by sorted user id and stays deterministic', () => {
    const input = {
      eligibleUserIds: ['user-b', 'user-a', 'user-c'],
      busyCountByUserId: { 'user-a': 1, 'user-b': 1, 'user-c': 1 },
    };
    expect(selectLeastBusyAgent(input)).toBe('user-a');
    expect(selectLeastBusyAgent(input)).toBe('user-a');
  });

  it('returns null when no eligible agent exists', () => {
    expect(
      selectLeastBusyAgent({ eligibleUserIds: [], busyCountByUserId: {} }),
    ).toBeNull();
  });
});

describe('selectRoundRobinAgent', () => {
  it('starts at the first sorted user id', () => {
    expect(
      selectRoundRobinAgent({
        eligibleUserIds: ['user-b', 'user-a'],
        lastAssignedUserId: null,
      }),
    ).toBe('user-a');
  });

  it('advances to the next sorted user id and wraps', () => {
    const eligibleUserIds = ['user-c', 'user-a', 'user-b'];
    expect(
      selectRoundRobinAgent({
        eligibleUserIds,
        lastAssignedUserId: 'user-a',
      }),
    ).toBe('user-b');
    expect(
      selectRoundRobinAgent({
        eligibleUserIds,
        lastAssignedUserId: 'user-c',
      }),
    ).toBe('user-a');
  });

  it('is deterministic for the same cursor and eligible set', () => {
    const input = {
      eligibleUserIds: ['user-b', 'user-a'],
      lastAssignedUserId: 'user-a',
    };
    expect(selectRoundRobinAgent(input)).toBe('user-b');
    expect(selectRoundRobinAgent(input)).toBe('user-b');
  });

  it('returns null when no eligible agent exists', () => {
    expect(
      selectRoundRobinAgent({
        eligibleUserIds: [],
        lastAssignedUserId: 'user-a',
      }),
    ).toBeNull();
  });
});
