import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/ui/segmented";
import { docsAudienceLabelKeys, docsAudiences, type DocsAudience } from "@/lib/docs/docs-audience";

/** Faza 3 (c): prekidač publike — mijenja lijevi nav i listu rezultata pretrage. */
export function DocsRoleFilter({
  audience,
  onChange,
}: {
  readonly audience: DocsAudience;
  readonly onChange: (audience: DocsAudience) => void;
}) {
  const { t } = useTranslation();
  return (
    <Segmented
      ariaLabel={t("docs.audience.label")}
      items={docsAudiences.map((value) => ({ value, label: t(docsAudienceLabelKeys[value]) }))}
      onChange={onChange}
      size="sm"
      value={audience}
    />
  );
}
