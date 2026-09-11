import path from 'node:path';
import {
  defaultUploadRoot,
  uploadRootEnvironmentKey,
} from './attachments.constants';
import { TicketsError } from '../tickets.error';

export function resolveUploadRoot(
  environment: NodeJS.Dict<string> = process.env,
): string {
  const configured = environment[uploadRootEnvironmentKey]?.trim();
  const root = configured === undefined || configured === ''
    ? defaultUploadRoot
    : configured;
  return path.resolve(root);
}

export function resolveContainedStoragePath(
  uploadRoot: string,
  storagePath: string,
): string {
  if (
    storagePath.trim().length === 0 ||
    path.isAbsolute(storagePath) ||
    storagePath.includes('\0') ||
    storagePath.split(/[\\/]/).includes('..')
  ) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  const root = path.resolve(uploadRoot);
  const resolved = path.resolve(root, storagePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  return resolved;
}
