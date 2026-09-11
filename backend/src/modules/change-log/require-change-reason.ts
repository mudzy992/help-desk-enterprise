import {
  changeLogErrorCodes,
  maximumChangeReasonLength,
} from './change-log.constants';
import { ChangeLogError } from './change-log.error';

export function requireChangeReason(reason: string | undefined): string {
  const normalized = reason?.trim() ?? '';
  if (
    normalized.length === 0 ||
    normalized.length > maximumChangeReasonLength
  ) {
    throw new ChangeLogError(changeLogErrorCodes.reasonRequired);
  }
  return normalized;
}
