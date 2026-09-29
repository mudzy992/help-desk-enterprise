import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

interface SkipToContentLinkProperties {
  readonly targetId: string;
}

/** First focusable element of the shell (WCAG 2.4.1); visible only when focused. */
export function SkipToContentLink({ targetId }: SkipToContentLinkProperties) {
  const { t } = useTranslation();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(targetId);
    if (target === null) {
      return;
    }
    event.preventDefault();
    target.focus({ preventScroll: false });
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={onClick}
      className="sr-only z-[100] rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
