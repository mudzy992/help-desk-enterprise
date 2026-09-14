import {
  edgeExtensionDenyReasons,
  type EdgeExtensionDenyReason,
} from './edge-extension.constants';
import type { EdgeExtensionConfiguration } from './edge-extension.types';

export function emailMatchesAllowedDomain(
  email: string,
  domain: string,
): boolean {
  const allowed = domain.trim().toLowerCase().replace(/^@/, '');
  if (allowed.length === 0) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator < 0) {
    return false;
  }
  return normalized.slice(separator + 1) === allowed;
}

export function isExtensionVersionAllowed(
  clientVersion: string,
  minClientVersion: string,
): boolean {
  const minimum = minClientVersion.trim();
  if (minimum.length === 0) {
    return true;
  }
  const client = clientVersion.trim();
  if (client.length === 0) {
    return false;
  }
  return compareDottedVersion(client, minimum) >= 0;
}

export function evaluateEdgeExtensionAccess(input: {
  readonly configuration: EdgeExtensionConfiguration;
  readonly email: string;
  readonly extensionVersion: string;
}): EdgeExtensionDenyReason {
  if (!input.configuration.addonEnabled) {
    return edgeExtensionDenyReasons.addonOff;
  }
  if (!input.configuration.moduleEnabled) {
    return edgeExtensionDenyReasons.disabled;
  }
  if (!input.configuration.notificationsEdgeEnabled) {
    return edgeExtensionDenyReasons.notificationsOff;
  }
  if (input.configuration.killSwitchEnabled) {
    return edgeExtensionDenyReasons.killSwitch;
  }
  if (
    !emailMatchesAllowedDomain(
      input.email,
      input.configuration.allowedEmailDomain,
    )
  ) {
    return edgeExtensionDenyReasons.domain;
  }
  if (
    !isExtensionVersionAllowed(
      input.extensionVersion,
      input.configuration.minClientVersion,
    )
  ) {
    return edgeExtensionDenyReasons.version;
  }
  return edgeExtensionDenyReasons.ok;
}

function compareDottedVersion(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index])
      ? (leftParts[index] ?? 0)
      : 0;
    const rightValue = Number.isFinite(rightParts[index])
      ? (rightParts[index] ?? 0)
      : 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  return 0;
}
