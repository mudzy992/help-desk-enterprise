export type ServiceCatalogLoadState = "loading" | "error" | "ready";

export interface ServiceCatalogLoadStateInput {
  readonly services: {
    readonly hasLoaded: boolean;
    readonly isLoading: boolean;
    readonly hasError: boolean;
  };
  readonly categories: {
    readonly hasLoaded: boolean;
    readonly isLoading: boolean;
  };
}

/**
 * Only replace the catalog with a full-page loading/error state before its
 * first successful read. A background refresh must leave cached rows visible.
 */
export function serviceCatalogLoadState(
  input: ServiceCatalogLoadStateInput,
): ServiceCatalogLoadState {
  if (
    (!input.services.hasLoaded && input.services.isLoading) ||
    (!input.categories.hasLoaded && input.categories.isLoading)
  ) {
    return "loading";
  }
  if (!input.services.hasLoaded && input.services.hasError) {
    return "error";
  }
  return "ready";
}
