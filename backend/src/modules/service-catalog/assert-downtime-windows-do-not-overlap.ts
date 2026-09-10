import { compareDowntimeInstants } from './parse-downtime-instant';
import { ServiceCatalogError } from './service-catalog.error';

export function downtimeWindowsOverlap(
  left: { readonly startsAt: Date; readonly endsAt: Date },
  right: { readonly startsAt: Date; readonly endsAt: Date },
): boolean {
  return (
    compareDowntimeInstants(left.startsAt, right.endsAt) < 0 &&
    compareDowntimeInstants(right.startsAt, left.endsAt) < 0
  );
}

export function assertDowntimeWindowsDoNotOverlap(input: {
  readonly existingWindows: readonly { readonly startsAt: Date; readonly endsAt: Date }[];
  readonly candidate: { readonly startsAt: Date; readonly endsAt: Date };
}): void {
  const overlaps = input.existingWindows.some((window) =>
    downtimeWindowsOverlap(window, input.candidate),
  );
  if (overlaps) {
    throw new ServiceCatalogError('OVERLAPPING_DOWNTIME_WINDOW');
  }
}
