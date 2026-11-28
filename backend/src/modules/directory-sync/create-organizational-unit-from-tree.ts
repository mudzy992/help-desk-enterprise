import {
  bumpOrganizationalUnitCatalogRevision,
  invalidateOrganizationalUnitScopeCache,
} from '../../common/cache/scope-catalog-cache';
import type { Prisma } from '../../generated/prisma/client';
import { formatDistinguishedNameAttribute } from '../../common/ldap/rfc4514-distinguished-name';
import type { OrganizationalUnitType } from '../../generated/prisma/enums';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordOrganizationalUnitChange } from '../organizational-units/record-organizational-unit-change';
import { createManualDirectoryOrganizationalUnitExternalId } from './create-manual-directory-organizational-unit-external-id';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import type {
  ManualDirectoryCatalogAuditContext,
  ManualDirectoryOrganizationalUnitResponse,
} from './manual-directory-catalog.types';
import { normalizeManualOrganizationalUnitName } from './normalize-manual-organizational-unit-name';
import {
  defaultManualDirectoryOrganizationalUnitType,
  parseManualDirectoryOrganizationalUnitType,
} from './parse-manual-directory-organizational-unit-type';
import {
  directoryNamespaceSuffixOf,
  resolveDirectoryNamespaceSuffix,
} from './resolve-directory-namespace-suffix';
import { recordManualDirectoryCatalogChange } from './record-manual-directory-catalog-change';
import { toManualDirectoryOrganizationalUnitResponse } from './to-manual-directory-organizational-unit-response';

export type CreateOrganizationalUnitFromTreeInput = {
  readonly displayName: string;
  readonly parentOrganizationalUnitId?: string | null;
  readonly type?: OrganizationalUnitType;
};

export type CreateOrganizationalUnitFromTreeResponse = {
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly type: OrganizationalUnitType;
    readonly distinguishedName: string;
    readonly ouPath: string;
    readonly parentId: string | null;
  };
  readonly catalogEntry: ManualDirectoryOrganizationalUnitResponse;
};

/**
 * W2.36c — the only supported way to add an organizational unit from the
 * directory screen.
 *
 * Before this function the screen asked the browser for a `distinguishedName`
 * and a catalogue `parentExternalId`, then hoped a later directory read would
 * materialize the row. Three things could go wrong, and all three did:
 *
 * 1. the client could send a DN the tree does not use (or a parent that only
 *    exists in the catalogue), which no read accepts — `INVALID_SCOPE` forever;
 * 2. the catalogue and the tree could live in different namespaces
 *    (`OU=Users,DC=example,DC=com` vs `OU=Korisnici,DC=local`), so a correct name
 *    still produced an unreadable DN;
 * 3. the read could fail after the catalogue row was committed, leaving a row
 *    that is selectable as a parent but never appears in the tree.
 *
 * The contract here makes all three impossible:
 *
 * - **the DN is not an input**: the operator sends a name and a tree parent, the
 *   server derives `OU=<name>,<parent DN>` (root units use the namespace the tree
 *   already uses);
 * - **the parent is a tree row**, and the catalogue is mirrored from it when it
 *   is missing, so no phantom parents;
 * - **one transaction** writes the catalogue row, the tree row and both audit
 *   entries, so "saved but not in the tree" cannot be observed.
 */
export async function createOrganizationalUnitFromTree(
  prisma: PrismaService,
  input: CreateOrganizationalUnitFromTreeInput,
  context: ManualDirectoryCatalogAuditContext = {
    actorUserId: null,
    requestId: null,
  },
): Promise<CreateOrganizationalUnitFromTreeResponse> {
  const name = normalizeManualOrganizationalUnitName(input.displayName);
  const parentId = input.parentOrganizationalUnitId?.trim() || null;

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const parent =
        parentId === null
          ? null
          : await transaction.organizationalUnit.findUnique({
              where: { id: parentId },
            });
      if (parentId !== null && parent === null) {
        throw new ManualDirectoryCatalogError('PARENT_NOT_FOUND', [], {
          parentOrganizationalUnitId: parentId,
        });
      }

      const namespaceSuffix =
        parent === null
          ? await resolveDirectoryNamespaceSuffix(transaction)
          : directoryNamespaceSuffixOf(parent.distinguishedName);
      if (namespaceSuffix === null) {
        throw new ManualDirectoryCatalogError('DIRECTORY_NAMESPACE_UNKNOWN');
      }

      const ouPath = parent === null ? `/${name}` : `${parent.ouPath}/${name}`;
      // W2.37: the RDN is escaped per RFC 4514 and the parent DN is used as it is
      // already canonical (it comes from the tree, not from the browser).
      const rdn = formatDistinguishedNameAttribute('OU', name);
      const distinguishedName =
        parent === null ? `${rdn},${namespaceSuffix}` : `${rdn},${parent.distinguishedName}`;
      await assertIdentityIsAvailable(transaction, { ouPath, distinguishedName });
      await assertCatalogPathIsAvailable(transaction, { ouPath, distinguishedName });

      // A child of a root unit is a branch, a root is a directorate — the same
      // defaulting the catalogue form used, now decided server-side.
      const type = parseManualDirectoryOrganizationalUnitType(
        input.type ?? null,
        defaultManualDirectoryOrganizationalUnitType(parent === null ? null : 'parent'),
      );
      const parentExternalId =
        parent === null ? null : await ensureCatalogEntryForTreeUnit(transaction, parent);

      const unit = await transaction.organizationalUnit.create({
        data: {
          name,
          type,
          distinguishedName,
          ouPath,
          parentId: parent?.id ?? null,
        },
      });
      // The OU row exists at this point, so the entity-scoped entry passes the
      // audit scope policy (W2.35b: writing it before the row existed is what
      // produced `AUDIT_SCOPE_ENTITY_NOT_FOUND`).
      await recordOrganizationalUnitChange(
        transaction as unknown as AuditLogWriteClient,
        {
          action: auditLogActions.organizationalUnitCreated,
          entityId: unit.id,
          organizationalUnitId: unit.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          metadata: {
            source: 'manual_directory_catalog',
            after: {
              name: unit.name,
              type: unit.type,
              distinguishedName: unit.distinguishedName,
              ouPath: unit.ouPath,
              parentId: unit.parentId,
            },
          },
        },
      );

      const catalogEntry = await transaction.manualDirectoryOrganizationalUnit.create({
        data: {
          externalId: createManualDirectoryOrganizationalUnitExternalId(ouPath),
          displayName: name,
          distinguishedName,
          organizationalUnitPath: ouPath,
          parentExternalId,
          type,
        },
      });
      await recordManualDirectoryCatalogChange(
        transaction as unknown as AuditLogWriteClient,
        {
          action: auditLogActions.directoryCatalogUnitCreated,
          entityId: catalogEntry.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          metadata: {
            // `materialized` is not in the action's allowlist; that the entry was
            // written next to a committed tree row is already the proof.
            source: 'manual_directory_catalog',
            after: {
              name: catalogEntry.displayName,
              distinguishedName: catalogEntry.distinguishedName,
              organizationalUnitPath: catalogEntry.organizationalUnitPath,
              parentExternalId: catalogEntry.parentExternalId,
              type: catalogEntry.type,
            },
          },
        },
      );
      // W2.11: the new path joins the (id, ouPath) catalogue every instance
      // caches; the bump commits with the row.
      await bumpOrganizationalUnitCatalogRevision(transaction);
      return { unit, catalogEntry };
    });

    invalidateOrganizationalUnitScopeCache();
    return {
      organizationalUnit: {
        id: created.unit.id,
        name: created.unit.name,
        type: created.unit.type,
        distinguishedName: created.unit.distinguishedName,
        ouPath: created.unit.ouPath,
        parentId: created.unit.parentId,
      },
      catalogEntry: toManualDirectoryOrganizationalUnitResponse(created.catalogEntry),
    };
  } catch (error) {
    throwIfCatalogUniqueConstraintViolated(error);
    throw error;
  }
}

async function assertIdentityIsAvailable(
  transaction: Prisma.TransactionClient,
  identity: { readonly ouPath: string; readonly distinguishedName: string },
): Promise<void> {
  const byName = await transaction.organizationalUnit.findUnique({
    where: { distinguishedName: identity.distinguishedName },
    select: { id: true },
  });
  if (byName !== null) {
    throw new ManualDirectoryCatalogError('DUPLICATE_DISTINGUISHED_NAME', [], {
      distinguishedName: identity.distinguishedName,
    });
  }
  const byPath = await transaction.organizationalUnit.findUnique({
    where: { ouPath: identity.ouPath },
    select: { id: true },
  });
  if (byPath !== null) {
    throw new ManualDirectoryCatalogError('DUPLICATE_PATH', [], {
      organizationalUnitPath: identity.ouPath,
    });
  }
}

/**
 * A catalogue row with the same path but another DN is the stale mirror the old
 * two-namespace flow produced. It cannot be adopted silently, because the row
 * would then describe a unit that is not in the tree; the operator is told what
 * collides and decides.
 */
async function assertCatalogPathIsAvailable(
  transaction: Prisma.TransactionClient,
  identity: { readonly ouPath: string; readonly distinguishedName: string },
): Promise<void> {
  const catalogRow = await transaction.manualDirectoryOrganizationalUnit.findUnique({
    where: { organizationalUnitPath: identity.ouPath },
    select: { distinguishedName: true },
  });
  if (catalogRow === null) {
    return;
  }
  throw new ManualDirectoryCatalogError('DUPLICATE_PATH', [], {
    organizationalUnitPath: identity.ouPath,
    catalogDistinguishedName: catalogRow.distinguishedName,
    distinguishedName: identity.distinguishedName,
  });
}

/**
 * Adopts a real tree unit into the catalogue (recursively, so `parentExternalId`
 * points at a real row). Without this a unit created by the install wizard could
 * never receive children: the catalogue only knew its own `example.com` rows.
 */
async function ensureCatalogEntryForTreeUnit(
  transaction: Prisma.TransactionClient,
  unit: {
    readonly id: string;
    readonly name: string;
    readonly type: OrganizationalUnitType;
    readonly distinguishedName: string;
    readonly ouPath: string;
    readonly parentId: string | null;
  },
): Promise<string> {
  const existing = await transaction.manualDirectoryOrganizationalUnit.findUnique({
    where: { distinguishedName: unit.distinguishedName },
    select: { externalId: true },
  });
  if (existing !== null) {
    return existing.externalId;
  }
  const pathTaken = await transaction.manualDirectoryOrganizationalUnit.findUnique({
    where: { organizationalUnitPath: unit.ouPath },
    select: { distinguishedName: true },
  });
  if (pathTaken !== null) {
    throw new ManualDirectoryCatalogError('DUPLICATE_PATH', [], {
      organizationalUnitPath: unit.ouPath,
      catalogDistinguishedName: pathTaken.distinguishedName,
      distinguishedName: unit.distinguishedName,
    });
  }
  const parentExternalId =
    unit.parentId === null
      ? null
      : await adoptedParentExternalId(transaction, unit.parentId);
  const adopted = await transaction.manualDirectoryOrganizationalUnit.create({
    data: {
      externalId: createManualDirectoryOrganizationalUnitExternalId(unit.ouPath),
      displayName: unit.name,
      distinguishedName: unit.distinguishedName,
      organizationalUnitPath: unit.ouPath,
      parentExternalId,
      type: unit.type,
    },
  });
  return adopted.externalId;
}

async function adoptedParentExternalId(
  transaction: Prisma.TransactionClient,
  parentId: string,
): Promise<string | null> {
  const parent = await transaction.organizationalUnit.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      name: true,
      type: true,
      distinguishedName: true,
      ouPath: true,
      parentId: true,
    },
  });
  if (parent === null) {
    return null;
  }
  return ensureCatalogEntryForTreeUnit(transaction, parent);
}

function throwIfCatalogUniqueConstraintViolated(error: unknown): void {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  ) {
    throw new ManualDirectoryCatalogError('IDENTITY_CONFLICT');
  }
}
