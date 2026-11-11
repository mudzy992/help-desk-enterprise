import { BadRequestException } from "@nestjs/common";

export type ServiceDowntimeWindowListCursor = {
  readonly serviceId: string;
  readonly from: string;
  readonly to: string;
  readonly startsAt: string;
  readonly id: string;
};

type EncodedCursor = ServiceDowntimeWindowListCursor & {
  readonly kind: "service-downtime-list-v1";
};

export function encodeServiceDowntimeWindowListCursor(
  cursor: ServiceDowntimeWindowListCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      kind: "service-downtime-list-v1",
      ...cursor,
    } satisfies EncodedCursor),
    "utf8",
  ).toString("base64url");
}

export function decodeServiceDowntimeWindowListCursor(
  value: string | undefined,
  expected: Pick<ServiceDowntimeWindowListCursor, "serviceId" | "from" | "to">,
): ServiceDowntimeWindowListCursor | null {
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
      !("serviceId" in decoded) ||
      !("from" in decoded) ||
      !("to" in decoded) ||
      !("startsAt" in decoded) ||
      !("id" in decoded) ||
      decoded.kind !== "service-downtime-list-v1" ||
      decoded.serviceId !== expected.serviceId ||
      decoded.from !== expected.from ||
      decoded.to !== expected.to ||
      typeof decoded.startsAt !== "string" ||
      Number.isNaN(Date.parse(decoded.startsAt)) ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0
    ) {
      throw invalidCursor();
    }
    return {
      serviceId: decoded.serviceId,
      from: decoded.from,
      to: decoded.to,
      startsAt: decoded.startsAt,
      id: decoded.id,
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException("INVALID_SERVICE_DOWNTIME_LIST_CURSOR");
}
