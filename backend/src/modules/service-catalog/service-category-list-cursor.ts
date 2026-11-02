import { BadRequestException } from "@nestjs/common";

export type ServiceCategoryListCursor = {
  readonly sortOrder: number;
  readonly name: string;
  readonly id: string;
};

type EncodedCategoryCursor = ServiceCategoryListCursor & {
  readonly kind: "service-category-list-v1";
};

export function encodeServiceCategoryListCursor(
  cursor: ServiceCategoryListCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      kind: "service-category-list-v1",
      ...cursor,
    } satisfies EncodedCategoryCursor),
    "utf8",
  ).toString("base64url");
}

export function decodeServiceCategoryListCursor(
  value?: string,
): ServiceCategoryListCursor | null {
  if (value === undefined) return null;
  if (value.length === 0 || value.length > 1024) throw invalidCursor();
  try {
    const decodedText = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decodedText, "utf8").toString("base64url") !== value)
      throw invalidCursor();
    const decoded: unknown = JSON.parse(decodedText);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("kind" in decoded) ||
      !("sortOrder" in decoded) ||
      !("name" in decoded) ||
      !("id" in decoded) ||
      decoded.kind !== "service-category-list-v1" ||
      typeof decoded.sortOrder !== "number" ||
      !Number.isInteger(decoded.sortOrder) ||
      typeof decoded.name !== "string" ||
      decoded.name.length === 0 ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0
    ) {
      throw invalidCursor();
    }
    return { sortOrder: decoded.sortOrder, name: decoded.name, id: decoded.id };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException("INVALID_SERVICE_CATEGORY_LIST_CURSOR");
}
