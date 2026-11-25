import {
  publishOrganizationalUnitCatalogueRevision,
  readPublishedOrganizationalUnitCatalogueRevision,
} from './catalogue-revision-probe';
import { runWithRequestId } from './request-context.storage';

/**
 * Perf kapija (2026-10-29): the revision the durable session read paid for is
 * published once per request and never leaks between requests.
 */
describe('catalogue revision probe', () => {
  it('has no value outside a request context', async () => {
    publishOrganizationalUnitCatalogueRevision(9n);
    expect(readPublishedOrganizationalUnitCatalogueRevision()).toBeUndefined();
  });

  it('publishes the revision for the current request only', async () => {
    await runWithRequestId('probe-request-1', async () => {
      expect(readPublishedOrganizationalUnitCatalogueRevision()).toBeUndefined();
      publishOrganizationalUnitCatalogueRevision(5n);
      await expect(readPublishedOrganizationalUnitCatalogueRevision()).resolves.toBe(5n);
    });
    expect(readPublishedOrganizationalUnitCatalogueRevision()).toBeUndefined();
  });

  it('keeps the first value when the same request publishes twice', async () => {
    await runWithRequestId('probe-request-2', async () => {
      publishOrganizationalUnitCatalogueRevision(5n);
      publishOrganizationalUnitCatalogueRevision(6n);
      await expect(readPublishedOrganizationalUnitCatalogueRevision()).resolves.toBe(5n);
    });
  });
});
