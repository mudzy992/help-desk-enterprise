import { useTranslation } from "react-i18next";
import { UnderlineTabs } from "@/components/ui/tabs";
import {
  configVersionStatusValues,
  type ConfigVersionStatus,
} from "@/services/config-versions-types";

interface ConfigVersionStatusTabsProperties {
  readonly active: ConfigVersionStatus | "ALL";
  readonly versions: readonly { readonly status: ConfigVersionStatus }[];
  readonly onChange: (status: ConfigVersionStatus | "ALL") => void;
}

export function ConfigVersionStatusTabs({
  active,
  versions,
  onChange,
}: ConfigVersionStatusTabsProperties) {
  const { t } = useTranslation();
  return (
    <UnderlineTabs
      className="mb-4"
      active={active}
      onChange={(key) => onChange(key as ConfigVersionStatus | "ALL")}
      items={[
        { key: "ALL", label: t("configVersions.filterAll"), count: versions.length },
        ...configVersionStatusValues.map((status) => ({
          key: status,
          label: t(`configVersions.statuses.${status}`),
          count: versions.filter((version) => version.status === status).length,
        })),
      ]}
    />
  );
}
