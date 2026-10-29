import { ApiError } from "@/services/api";

export function mapDomainApiError<Key extends string>(
  error: unknown,
  contract: {
    readonly fallback: Key;
    readonly codes?: Readonly<Partial<Record<string, Key>>>;
    readonly statuses?: Readonly<Partial<Record<number, Key>>>;
  },
): Key {
  if (!(error instanceof ApiError)) return contract.fallback;
  return contract.codes?.[error.code] ?? contract.statuses?.[error.status] ?? contract.fallback;
}
