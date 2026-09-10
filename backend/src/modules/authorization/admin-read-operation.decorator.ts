import { SetMetadata } from '@nestjs/common';
import { ADMIN_READ_OPERATION_METADATA_KEY } from './read-only-mode.constants';

export const AdminReadOperation = () =>
  SetMetadata(ADMIN_READ_OPERATION_METADATA_KEY, true);
