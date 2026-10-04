import { BookOpen, FileQuestion, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type DocsEmptyKind = "empty" | "notFound" | "filter" | "search" | "unavailable";

const icons: Readonly<Record<DocsEmptyKind, typeof BookOpen>> = {
  empty: BookOpen,
  notFound: FileQuestion,
  filter: SearchX,
  search: SearchX,
  unavailable: FileQuestion,
};

/**
 * Faza 3 (c): prazno stanje, 404 i nedostupno ogledalo. Uvijek sa linkom na
 * `/docs`, da korisnik ne ostane na slijepoj ulici.
 */
export function DocsEmptyState({
  kind,
  title,
  body,
}: {
  readonly kind: DocsEmptyKind;
  readonly title: string;
  readonly body?: string;
}) {
  const { t } = useTranslation();
  const Icon = icons[kind];
  return (
    <EmptyState
      action={
        <Link to="/docs">
          <Button size="sm" variant="secondary">
            {t("docs.backToDocs")}
          </Button>
        </Link>
      }
      body={body}
      icon={<Icon size={18} strokeWidth={1.8} />}
      title={title}
    />
  );
}
