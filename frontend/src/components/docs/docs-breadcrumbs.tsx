import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { docsPartLabel } from "@/lib/docs/docs-labels";

/** Faza 3 (c): `Dokumentacija › <dio> › <stranica>`. */
export function DocsBreadcrumbs({
  part,
  title,
}: {
  readonly part: { readonly key: string; readonly label: string };
  readonly title: string;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("docs.breadcrumbsLabel")} className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <Link className="hover:text-foreground" to="/docs">
        {t("docs.title")}
      </Link>
      <span aria-hidden="true">/</span>
      <span>{docsPartLabel(t, part)}</span>
      <span aria-hidden="true">/</span>
      <span className="text-foreground/80">{title}</span>
    </nav>
  );
}
