import { BadRequestException } from "@nestjs/common";

export type FormVersionListCursor = {
  readonly serviceId: string;
  readonly version: number;
  readonly id: string;
};

type EncodedFormVersionCursor = FormVersionListCursor & {
  readonly kind: "service-form-version-list-v1";
};

export function encodeFormVersionListCursor(
  cursor: FormVersionListCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      kind: "service-form-version-list-v1",
      ...cursor,
    } satisfies EncodedFormVersionCursor),
    "utf8",
  ).toString("base64url");
}

export function decodeFormVersionListCursor(
  value: string | undefined,
  serviceId: string,
): FormVersionListCursor | null {
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
      !("version" in decoded) ||
      !("id" in decoded) ||
      decoded.kind !== "service-form-version-list-v1" ||
      decoded.serviceId !== serviceId ||
      typeof decoded.version !== "number" ||
      !Number.isInteger(decoded.version) ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0
    ) {
      throw invalidCursor();
    }
    return {
      serviceId: decoded.serviceId,
      version: decoded.version,
      id: decoded.id,
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException("INVALID_SERVICE_FORM_VERSION_CURSOR");
}
