export const policyPackKeys = {
  itStandard: 'PACK_IT_STANDARD',
  hrRestricted: 'PACK_HR_RESTRICTED',
  financeRestricted: 'PACK_FINANCE_RESTRICTED',
} as const;

export const policyPackGrantScopes = {
  none: 'none',
  target: 'target',
} as const;

export const defaultPolicyPackKeyList: readonly string[] = [
  policyPackKeys.itStandard,
  policyPackKeys.hrRestricted,
  policyPackKeys.financeRestricted,
];
