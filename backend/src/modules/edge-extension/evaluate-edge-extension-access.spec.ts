import {
  emailMatchesAllowedDomain,
  evaluateEdgeExtensionAccess,
  isExtensionVersionAllowed,
} from './evaluate-edge-extension-access';
import { edgeExtensionDenyReasons } from './edge-extension.constants';
import type { EdgeExtensionConfiguration } from './edge-extension.types';

const open: EdgeExtensionConfiguration = {
  addonEnabled: true,
  moduleEnabled: true,
  notificationsEdgeEnabled: true,
  killSwitchEnabled: false,
  wsEnabled: true,
  reconnectMaxBackoffSeconds: 60,
  minClientVersion: '',
  redactedPreviews: true,
  receiptsEnabled: true,
  dedupEnabled: true,
  pollingFallbackEnabled: true,
  pollingIntervalSeconds: 90,
  allowedEmailDomain: 'epbih.ba',
};

describe('evaluateEdgeExtensionAccess', () => {
  it('allows an in-domain client when the kill switch is off', () => {
    expect(
      evaluateEdgeExtensionAccess({
        configuration: open,
        email: 'user@epbih.ba',
        extensionVersion: '0.0.1',
      }),
    ).toBe(edgeExtensionDenyReasons.ok);
  });

  it('blocks when the kill switch is engaged', () => {
    expect(
      evaluateEdgeExtensionAccess({
        configuration: { ...open, killSwitchEnabled: true },
        email: 'user@epbih.ba',
        extensionVersion: '0.0.1',
      }),
    ).toBe(edgeExtensionDenyReasons.killSwitch);
  });

  it('blocks a foreign email domain', () => {
    expect(
      evaluateEdgeExtensionAccess({
        configuration: open,
        email: 'user@example.com',
        extensionVersion: '0.0.1',
      }),
    ).toBe(edgeExtensionDenyReasons.domain);
  });

  it('compares dotted versions', () => {
    expect(isExtensionVersionAllowed('0.0.2', '0.0.1')).toBe(true);
    expect(isExtensionVersionAllowed('0.0.1', '0.0.2')).toBe(false);
    expect(isExtensionVersionAllowed('1.0.0', '')).toBe(true);
    expect(emailMatchesAllowedDomain('Ana@EPBIH.BA', 'epbih.ba')).toBe(true);
  });
});
