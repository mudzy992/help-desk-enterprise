import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import type { ConfigValidationIssue } from "@/services/config-versions-types";

interface ConfigValidationErrorsProperties {
  readonly issues: readonly ConfigValidationIssue[];
}

export function ConfigValidationErrors({ issues }: ConfigValidationErrorsProperties) {
  const { t } = useTranslation();
  if (issues.length === 0) {
    return (
      <EmptyState
        title={t("configVersions.validationOkTitle")}
        body={t("configVersions.validationOkBody")}
      />
    );
  }
  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[480px] text-left text-[13px]">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="px-3 py-2">{t("configVersions.columnPath")}</th>
            <th className="px-3 py-2">{t("configVersions.columnCode")}</th>
            <th className="px-3 py-2">{t("configVersions.columnMessage")}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => (
            <tr key={`${issue.path}-${issue.code}-${index}`} className={tableRowClassName}>
              <td className="px-3 font-mono text-[12px]">{issue.path}</td>
              <td className="px-3 tnum">{issue.code}</td>
              <td className="px-3 text-[12.5px]">{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
