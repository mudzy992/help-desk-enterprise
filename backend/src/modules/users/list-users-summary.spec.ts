import { resolveUserRoleTone } from './list-users-summary';

describe('resolveUserRoleTone', () => {
  it('maps system roles to reference tones', () => {
    expect(resolveUserRoleTone('SUPER_ADMIN')).toBe('super');
    expect(resolveUserRoleTone('ADMIN')).toBe('manager');
    expect(resolveUserRoleTone('AGENT')).toBe('agent');
    expect(resolveUserRoleTone('USER')).toBe('user');
    expect(resolveUserRoleTone(null)).toBe('user');
  });
});
