import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DocsHeading } from "@/services/docs-api";

/**
 * Faza 3 (c): desni TOC. Aktivna sekcija se prati `IntersectionObserver`-om nad
 * `id` atributima koje je renderer postavio iz `manifest.json`.
 */
export function DocsToc({ toc }: { readonly toc: readonly DocsHeading[] }) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (toc.length === 0) {
      setActiveId(null);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const elements = toc
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] },
    );
    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [toc]);

  if (toc.length === 0) {
    return null;
  }

  return (
    <nav aria-label={t("docs.tocLabel")} className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("docs.toc")}
      </p>
      <ul className="border-l border-border">
        {toc.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                aria-current={active ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-0.5 text-[12px] leading-5",
                  heading.level >= 3 ? "pl-4" : "pl-2",
                  active
                    ? "border-link font-medium text-link"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                href={`#${heading.id}`}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
