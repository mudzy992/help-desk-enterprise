export type PageLocationIdentity = {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
};

/**
 * Identifies the rendered screen, including URL state that can select a
 * different view without changing the pathname.
 */
export function pageRenderKey(location: PageLocationIdentity): string {
  return `${location.pathname}${location.search}${location.hash}`;
}
