import { BadRequestException } from "@nestjs/common";

export type ServiceListCursor = {
  readonly name: string;
  readonly id: string;
  readonly filterKey: string;
};

type EncodedServiceListCursor = ServiceListCursor & {
  readonly kind: "service-list-v1";
};

export function encodeServiceListCursor(cursor: ServiceListCursor): string {
  const value: EncodedServiceListCursor = {
    kind: "service-list-v1",
    ...cursor,
  };
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeServiceListCursor(
  value: string | undefined,
  expectedFilterKey: string,
): ServiceListCursor | null {
  if (value === undefined) return null;
  if (value.length === 0 || value.length > 1024) throw invalidCursor();
  try {
    const decodedText = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decodedText, "utf8").toString("base64url") !== value) {
      throw invalidCursor();
    }
    const decoded: unknown = JSON.parse(decodedText);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("kind" in decoded) ||
      !("name" in decoded) ||
      !("id" in decoded) ||
      !("filterKey" in decoded) ||
      decoded.kind !== "service-list-v1" ||
      typeof decoded.name !== "string" ||
      typeof decoded.id !== "string" ||
      decoded.name.length === 0 ||
      decoded.id.length === 0 ||
      typeof decoded.filterKey !== "string" ||
      decoded.filterKey !== expectedFilterKey
    ) {
      throw invalidCursor();
    }
    return { name: decoded.name, id: decoded.id, filterKey: decoded.filterKey };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException("INVALID_SERVICE_LIST_CURSOR");
}
