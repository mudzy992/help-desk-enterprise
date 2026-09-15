export function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
}

export function formatSignedDelta(
  value: number,
  locale: string,
  unit: string,
): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, locale)} ${unit}`;
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatMinutes(value: number, locale: string): string {
  return `${formatNumber(Math.round(value), locale)} min`;
}

export function formatHours(value: number, locale: string): string {
  return `${formatNumber(value, locale)} h`;
}

export function formatCsat(
  average: number,
  scaleMax: number,
  locale: string,
): string {
  return `${formatNumber(average, locale)} / ${scaleMax}`;
}

export function deltaTone(
  value: number | null,
  invert: boolean,
): "success" | "warning" | "neutral" {
  if (value === null || value === 0) {
    return "neutral";
  }
  const improved = invert ? value < 0 : value > 0;
  return improved ? "success" : "warning";
}
