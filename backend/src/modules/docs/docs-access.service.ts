import { Injectable } from '@nestjs/common';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import type { DocsPageRecord } from './docs.types';

/**
 * Documentation access is decided from effective global permissions, never
 * directly from assignment role keys. Legacy `roles` metadata remains an
 * artifact-format compatibility field and is translated to a capability here.
 */
@Injectable()
export class DocsAccessService {
  canRead(page: DocsPageRecord, globalPermissionKeys: readonly string[]): boolean {
    const required = requiredPermissionFor(page.roles);
    return required === null || globalPermissionKeys.includes(required);
  }

  visiblePages(
    pages: readonly DocsPageRecord[],
    globalPermissionKeys: readonly string[],
  ): readonly DocsPageRecord[] {
    return pages.filter((page) => this.canRead(page, globalPermissionKeys));
  }
}

function requiredPermissionFor(roleKeys: readonly string[]): string | null {
  if (roleKeys.length === 0) return null;
  if (roleKeys.length === 1 && roleKeys[0] === authorizationRoleKeys.superAdmin) {
    return permissionKeys.confidentialBreakGlass;
  }
  if (roleKeys.includes(authorizationRoleKeys.problemManager)) return permissionKeys.problemRead;
  if (roleKeys.includes(authorizationRoleKeys.changeManager)) return permissionKeys.changeRead;
  if (roleKeys.includes(authorizationRoleKeys.agent)) return permissionKeys.docsAgentRead;
  return permissionKeys.settingsRead;
}
