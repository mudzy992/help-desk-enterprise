import { Trans, useTranslation } from "react-i18next";

/**
 * F2: "Tiket za *Servis* ide grupi *Grupa* u OU *OU*". The operator sees the
 * sentence the routing will produce before anything is created — the names on
 * the left of the arrow are the ones they typed.
 */
export function InstallStructurePreview({
  organizationalUnitName,
  handlerGroupName,
  serviceName,
}: {
  readonly organizationalUnitName: string;
  readonly handlerGroupName: string;
  readonly serviceName: string;
}) {
  const { t } = useTranslation();
  const unit = organizationalUnitName.trim();
  const group = handlerGroupName.trim();
  const service = serviceName.trim();

  return (
    <p
      className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-[13px] leading-6 text-foreground"
      data-testid="install-structure-preview"
    >
      <Trans
        i18nKey="install.structure.preview"
        values={{
          service: service.length > 0 ? service : t("install.structure.previewEmpty"),
          group: group.length > 0 ? group : t("install.structure.previewEmpty"),
          organizationalUnit: unit.length > 0 ? unit : t("install.structure.previewEmpty"),
        }}
        components={{
          service: <span className="font-semibold text-link" />,
          group: <span className="font-semibold text-link" />,
          organizationalUnit: <span className="font-semibold text-link" />,
        }}
      />
    </p>
  );
}
