import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  errorTextClassName,
  hintClassName,
  selectCompactClassName,
} from "@/components/ui/control";
import { mapPolicyPacksError, type PolicyPacksMessageKey } from "@/lib/policy-packs/map-policy-packs-error";
import {
  applyPolicyPack,
  type PolicyPackApplyResult,
  type PolicyPackSummary,
} from "@/services/policy-packs-api";

interface PolicyPackApplyFormProperties {
  readonly packs: readonly PolicyPackSummary[];
  readonly unitOptions: readonly { id: string; label: string }[];
  readonly serviceOptions: readonly { id: string; label: string }[];
}

export function PolicyPackApplyForm({
  packs,
  unitOptions,
  serviceOptions,
}: PolicyPackApplyFormProperties) {
  const { t } = useTranslation();
  const [packKey, setPackKey] = useState(packs[0]?.key ?? "");
  const [unitId, setUnitId] = useState(unitOptions[0]?.id ?? "");
  const [serviceId, setServiceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<PolicyPacksMessageKey | null>(null);
  const [result, setResult] = useState<PolicyPackApplyResult | null>(null);

  const handleApply = async () => {
    if (packKey.length === 0 || unitId.length === 0) {
      setErrorKey("policyPacks.errorValidation");
      return;
    }
    setIsSaving(true);
    setErrorKey(null);
    setResult(null);
    try {
      const applied = await applyPolicyPack({
        packKey,
        organizationalUnitId: unitId,
        ...(serviceId.length > 0 ? { serviceId } : {}),
      });
      setResult(applied);
    } catch (error) {
      setErrorKey(mapPolicyPacksError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("policyPacks.applyTitle")}
        subtitle={t("policyPacks.applySubtitle")}
      />
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-3">
        <label className="grid gap-1.5 text-[12.5px] font-medium text-foreground">
          {t("policyPacks.packLabel")}
          <select
            className={selectCompactClassName}
            value={packKey}
            onChange={(event) => setPackKey(event.target.value)}
          >
            {packs.map((pack) => (
              <option key={pack.key} value={pack.key}>
                {pack.name} ({pack.key})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-foreground">
          {t("policyPacks.unitLabel")}
          <select
            className={selectCompactClassName}
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
          >
            {unitOptions.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-foreground">
          {t("policyPacks.serviceLabel")}
          <select
            className={selectCompactClassName}
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
          >
            <option value="">{t("policyPacks.serviceOptional")}</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>
                {service.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <Button
          variant="primary"
          size="sm"
          disabled={isSaving || packs.length === 0}
          onClick={() => void handleApply()}
        >
          {isSaving ? t("policyPacks.applying") : t("policyPacks.apply")}
        </Button>
        {errorKey ? (
          <p role="alert" className={errorTextClassName}>
            {t(errorKey)}
          </p>
        ) : null}
        {result ? (
          <p className={hintClassName}>
            {t("policyPacks.applyResult", {
              roles: result.createdUserRoleCount,
              permissions: result.createdRolePermissionCount,
            })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
