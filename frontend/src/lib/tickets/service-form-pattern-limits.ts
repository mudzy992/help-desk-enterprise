export const SERVICE_FORM_PATTERN_INPUT_MAX_BYTES = 4096;

/** Returns true only when the value fits the byte cap without a large allocation. */
export function isWithinServiceFormPatternInputByteLimit(value: string): boolean {
  if (value.length > SERVICE_FORM_PATTERN_INPUT_MAX_BYTES) return false;

  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (isHighSurrogate(codeUnit) && isLowSurrogate(value.charCodeAt(index + 1))) {
      byteLength += 4;
      index += 1;
    } else {
      byteLength += 3;
    }
    if (byteLength > SERVICE_FORM_PATTERN_INPUT_MAX_BYTES) return false;
  }
  return true;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
