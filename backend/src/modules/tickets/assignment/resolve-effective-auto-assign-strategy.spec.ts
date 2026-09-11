import { resolveEffectiveAutoAssignStrategy } from './resolve-effective-auto-assign-strategy';
import { defaultTicketAssignmentConfiguration } from './assignment.constants';

describe('resolveEffectiveAutoAssignStrategy', () => {
  it('stays NONE while auto-assign is disabled', () => {
    expect(
      resolveEffectiveAutoAssignStrategy({
        configuration: defaultTicketAssignmentConfiguration,
        serviceStrategy: 'LEAST_BUSY',
      }),
    ).toBe('NONE');
  });

  it('uses the service strategy when auto-assign is enabled', () => {
    expect(
      resolveEffectiveAutoAssignStrategy({
        configuration: {
          ...defaultTicketAssignmentConfiguration,
          autoAssignEnabled: true,
        },
        serviceStrategy: 'ROUND_ROBIN',
      }),
    ).toBe('ROUND_ROBIN');
  });

  it('falls back to the global strategy when the service strategy is NONE', () => {
    expect(
      resolveEffectiveAutoAssignStrategy({
        configuration: {
          ...defaultTicketAssignmentConfiguration,
          autoAssignEnabled: true,
          autoAssignStrategy: 'ROUND_ROBIN',
        },
        serviceStrategy: 'NONE',
      }),
    ).toBe('ROUND_ROBIN');
  });
});
