export function withSearchParam(
  current: URLSearchParams,
  key: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (value === "") next.delete(key);
  else next.set(key, value);
  return next;
}
