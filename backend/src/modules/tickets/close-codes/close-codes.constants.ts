export const defaultCloseCodeKeys = [
  'solved_by_user',
  'howto',
  'access_granted',
  'config_change',
  'bug_fixed',
  'hardware_replaced',
  'other',
] as const;

export const defaultTicketCloseCodesConfiguration = {
  enabled: true,
  allowedCodes: defaultCloseCodeKeys,
  requireOnResolve: true,
} as const;

export const ticketCloseCodeConstants = {
  maximumResolutionNoteLength: 2000,
  maximumKeyLength: 64,
} as const;

export function humanizeCloseCodeKey(key: string): string {
  return key
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
