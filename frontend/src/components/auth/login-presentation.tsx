import { BookOpen, Ticket, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

const points = [
  { icon: Ticket, key: "login.pointTickets" },
  { icon: BookOpen, key: "login.pointKnowledge" },
  { icon: TrendingUp, key: "login.pointInsight" },
] as const;

export function LoginValuePoints() {
  const { t } = useTranslation();
  return (
    <ul className="mt-7 space-y-3">
      {points.map((point) => (
        <li key={point.key} className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
            <point.icon size={14} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="text-[12.5px] leading-5 text-primary-foreground/90">{t(point.key)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Four-square Microsoft logo (brand colours are fixed by Microsoft). */
export function MicrosoftMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden="true" className="mr-1.5">
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
