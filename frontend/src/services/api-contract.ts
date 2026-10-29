import { ApiError } from "@/services/api";

export type ApiParser<T> = (value: unknown) => T;

export function invalidApiResponse(message: string): never {
  throw new ApiError(502, "INVALID_API_RESPONSE", message);
}

export function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidApiResponse(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function array(value: unknown, context: string): readonly unknown[] {
  if (!Array.isArray(value)) return invalidApiResponse(`${context} must be an array`);
  return value;
}

export function string(value: unknown, context: string): string {
  if (typeof value !== "string") return invalidApiResponse(`${context} must be a string`);
  return value;
}

export function nonEmptyString(value: unknown, context: string): string {
  const parsed = string(value, context);
  if (parsed.trim().length === 0) return invalidApiResponse(`${context} must not be empty`);
  return parsed;
}

export function boolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") return invalidApiResponse(`${context} must be a boolean`);
  return value;
}

export function number(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalidApiResponse(`${context} must be a finite number`);
  }
  return value;
}

export function nullableString(value: unknown, context: string): string | null {
  return value === null ? null : string(value, context);
}

export function stringArray(value: unknown, context: string): readonly string[] {
  return array(value, context).map((entry, index) => string(entry, `${context}[${index}]`));
}

export function objectArray<T>(
  value: unknown,
  context: string,
  parser: (entry: unknown, context: string) => T,
): readonly T[] {
  return array(value, context).map((entry, index) => parser(entry, `${context}[${index}]`));
}
