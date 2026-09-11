import type { TFunction } from "i18next";

export function ticketText(
  translate: TFunction,
  key: string,
  options?: Record<string, string | number>,
): string {
  return translate(key as never, (options ?? {}) as never) as unknown as string;
}
