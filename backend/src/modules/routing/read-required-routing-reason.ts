import {
  changeLogErrorCodes,
} from '../change-log/change-log.constants';
import { ChangeLogError } from '../change-log/change-log.error';
import { requireChangeReason } from '../change-log/require-change-reason';
import { RoutingError } from './routing.error';

export function readRequiredRoutingReason(reason: string): string {
  try {
    return requireChangeReason(reason);
  } catch (error) {
    if (
      error instanceof ChangeLogError &&
      error.code === changeLogErrorCodes.reasonRequired
    ) {
      throw new RoutingError('REASON_REQUIRED');
    }
    throw error;
  }
}
