import { readFileSync } from 'node:fs';
import path from 'node:path';
import { adminReadOnlyRouteRegistry } from './admin-read-only-route-registry';
import {
  findAdminReadOnlyCensusViolations,
  type AdminRouteCensusEntry,
} from './admin-read-only-route-census';
import { adminReadOnlyModuleKeys } from './read-only-mode.constants';

/**
 * The guard test for read-only mode.
 *
 * `adminReadOnlyRouteRegistry` is what the runtime uses to decide whether a
 * request may write. This spec holds that registry against the central route
 * manifest (`docs/backend/backend-wiring-manifest.json`, generated from the real
 * controllers and required to be in sync by `npm run wiring`), so the answer to
 * "is this admin route locked?" can no longer drift away from the routes that
 * actually exist.
 */

type Manifest = {
  readonly routes: readonly AdminRouteCensusEntry[];
};

function readManifest(): Manifest {
  const manifestPath = path.resolve(
    __dirname,
    '../../../../docs/backend/backend-wiring-manifest.json',
  );
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
}

function route(
  controller: string,
  handler: string,
  method: string,
  routePath: string,
): AdminRouteCensusEntry {
  return { controller, handler, method, path: routePath };
}

describe('admin read-only route census', () => {
  const manifest = readManifest();

  it('catalogues every mutating admin route exactly once', () => {
    expect(manifest.routes.length).toBeGreaterThan(500);
    expect(findAdminReadOnlyCensusViolations(manifest.routes)).toEqual([]);
    expect(adminReadOnlyRouteRegistry).toHaveLength(74);
  });

  it('exempts only handlers that perform no persistent write', () => {
    // Pinning the exemption list is the point: a new `kind: 'read'` entry is a
    // reviewable decision in the census, not a local annotation somebody can
    // drop on their own endpoint.
    expect(
      adminReadOnlyRouteRegistry
        .filter((registration) => registration.kind === 'read')
        .map((registration) => registration.handler)
        .sort(),
    ).toEqual([
      'ConfigVersioningController.previewImport',
      'ConfigVersioningController.shadow',
      'ConfigVersioningController.validate',
      'PolicyPacksController.validate',
    ]);
  });

  it('spans every lockable module in the routing tree', () => {
    const modules = new Set(
      adminReadOnlyRouteRegistry.map((registration) => registration.moduleKey),
    );

    expect([...modules].sort()).toEqual(
      [
        adminReadOnlyModuleKeys.admin,
        adminReadOnlyModuleKeys.routing,
        adminReadOnlyModuleKeys.serviceCatalog,
        adminReadOnlyModuleKeys.serviceForms,
        adminReadOnlyModuleKeys.settings,
        adminReadOnlyModuleKeys.sla,
      ].sort(),
    );
  });

  it('fails the guard when a mutation is not catalogued', () => {
    const uncatalogized = route(
      'SettingsController',
      'rotateRetentionPolicy',
      'POST',
      '/settings/retention-policy',
    );

    expect(
      findAdminReadOnlyCensusViolations([...manifest.routes, uncatalogized]),
    ).toEqual([
      {
        kind: 'uncatalogized-mutation',
        handler: 'SettingsController.rotateRetentionPolicy',
        detail:
          'POST /settings/retention-policy pripada modulu settings, ali nema zapisa u read-only registru',
      },
    ]);
  });

  it('fails the guard when a registration no longer matches the manifest', () => {
    const withoutRoute = manifest.routes.filter(
      (entry) =>
        `${entry.controller}.${entry.handler}` !==
        'ServiceFormsController.createFormVersion',
    );

    expect(findAdminReadOnlyCensusViolations(withoutRoute)).toContainEqual({
      kind: 'stale-registration',
      handler: 'ServiceFormsController.createFormVersion',
      detail: 'ruta više ne postoji u centralnom manifestu',
    });
  });

  it('fails the guard when a route moves to another module', () => {
    const moved = manifest.routes.map((entry) =>
      entry.path === '/sla/rules' && entry.method === 'POST'
        ? { ...entry, path: '/routing/sla-rules' }
        : entry,
    );

    expect(findAdminReadOnlyCensusViolations(moved)).toContainEqual({
      kind: 'module-mismatch',
      handler: 'SlaRulesController.create',
      detail: 'registar kaže sla, URL pripada routing',
    });
  });
});
