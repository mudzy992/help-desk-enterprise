import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { mapPolicyPackError } from '../policy-packs/map-policy-pack-error';
import { PolicyPackError } from '../policy-packs/policy-pack.error';
import { installPolicyPackErrorCodes } from './install-policy-pack.constants';
import { InstallPolicyPackError } from './install-policy-pack.error';
import type { InstallPolicyPackErrorCode } from './install-policy-pack.error';

const messages: Record<InstallPolicyPackErrorCode, string> = {
  POLICY_PACK_NOT_OFFERED:
    'This policy pack is not offered by the applied blueprint',
  POLICY_PACK_STRUCTURE_REQUIRED:
    'Run the structure step first: the pack is applied to an organizational unit',
  SUPER_ADMIN_REQUIRED:
    'Initial SuperAdmin must exist before the policy pack step',
  PACK_DISABLED:
    'This policy pack is switched off in settings (private.policyPacks.disabledKeysCsv)',
};

export function mapInstallPolicyPackError(error: unknown): HttpException {
  // A pack the domain refuses (unknown unit, SuperAdmin grant, switched off…)
  // keeps the answer the Settings screen gives — one code, one wording.
  if (error instanceof PolicyPackError) {
    return mapPolicyPackError(error);
  }
  if (!(error instanceof InstallPolicyPackError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (
    error.code === installPolicyPackErrorCodes.superAdminRequired ||
    error.code === installPolicyPackErrorCodes.structureRequired ||
    error.code === installPolicyPackErrorCodes.packDisabled
  ) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
