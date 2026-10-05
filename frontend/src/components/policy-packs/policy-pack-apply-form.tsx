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
  buildPolicyPackApplyInput,
  hasPolicyPackTarget,
  type PolicyPackApplyDraft,
} from "@/lib/policy-packs/policy-pack-apply-target";
import {
  applyPolicyPack,
  unapplyPolicyPack,
  validatePolicyPack,
  type PolicyPackApplyResult,
  type PolicyPackSummary,
  type PolicyPackUnapplyResult,
  type PolicyPackValidateResult,
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
  // M5 B3: the target may be an OU, a service or both — no default OU, so the
  // admin chooses explicitly what the pack is bound to.
  const [unitId, setUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [errorKey, setErrorKey] = useState<PolicyPacksMessageKey | null>(null);
  const [result, setResult] = useState<PolicyPackApplyResult | null>(null);
  const [unapplied, setUnapplied] = useState<PolicyPackUnapplyResult | null>(
    null,
  );
  // M5 B6: nothing is applied before the admin has seen the plan for the exact
  // target below. Any change to the pick clears the plan again.
  const [plan, setPlan] = useState<PolicyPackValidateResult | null>(null);

  const draft: PolicyPackApplyDraft = {
    packKey,
    organizationalUnitId: unitId,
    serviceId,
  };
  const readInput = () => buildPolicyPackApplyInput(draft);

  const handleValidate = async () => {
    if (packKey.length === 0 || !hasPolicyPackTarget(draft)) {
      setErrorKey("policyPacks.errorTargetRequired");
      return;
    }
    setIsChecking(true);
    setErrorKey(null);
    setResult(null);
    try {
      setPlan(await validatePolicyPack(readInput()));
    } catch (error) {
      setPlan(null);
      setErrorKey(mapPolicyPacksError(error));
    } finally {
      setIsChecking(false);
    }
  };

  const handleUnapply = async () => {
    if (plan === null) {
      setErrorKey("policyPacks.errorValidationRequired");
      return;
    }
    setIsSaving(true);
    setErrorKey(null);
    setResult(null);
    setUnapplied(null);
    try {
      const removed = await unapplyPolicyPack(readInput());
      setUnapplied(removed);
      setPlan(null);
    } catch (error) {
      setErrorKey(mapPolicyPacksError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async () => {
    if (packKey.length === 0 || !hasPolicyPackTarget(draft)) {
      setErrorKey("policyPacks.errorTargetRequired");
      return;
    }
    if (plan === null) {
      setErrorKey("policyPacks.errorValidationRequired");
      return;
    }
    setIsSaving(true);
    setErrorKey(null);
    setResult(null);
    setUnapplied(null);
    try {
      const applied = await applyPolicyPack(readInput());
      setResult(applied);
      setPlan(null);
    } catch (error) {
      setErrorKey(mapPolicyPacksError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <details>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <CardHeader
            title={t("policyPacks.applyTitle")}
            subtitle={t("policyPacks.applySubtitle")}
          />
        </summary>
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-[12.5px] font-medium text-foreground">
            {t("policyPacks.packLabel")}
            <select
              className={selectCompactClassName}
              value={packKey}
              onChange={(event) => {
                setPackKey(event.target.value);
                setPlan(null);
              }}
            >
              {packs.map((pack) => (
                <option key={pack.key} value={pack.key}>
                  {t(`policyPacks.packs.${pack.key}.name`, {
                    defaultValue: pack.name,
                  })}
                  {pack.isDisabled ? ` (${t("policyPacks.disabledTag")})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-[12.5px] font-medium text-foreground">
            {t("policyPacks.unitLabel")}
            <select
              className={selectCompactClassName}
              value={unitId}
              onChange={(event) => {
                setUnitId(event.target.value);
                setPlan(null);
              }}
            >
              <option value="">{t("policyPacks.unitOptional")}</option>
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
              onChange={(event) => {
                setServiceId(event.target.value);
                setPlan(null);
              }}
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
        {plan !== null ? (
          <div className="mx-4 mb-3 rounded-md border border-border bg-background/40 px-4 py-3 text-[12.5px]">
            <p className="font-medium text-foreground">{t("policyPacks.planTitle")}</p>
            <p className="mt-0.5 text-muted-foreground">
              {t("policyPacks.planSummary", {
                users: plan.userIds.length,
                assignments: plan.plannedAssignments.length,
              })}
            </p>
            {plan.servicePolicy ? (
              <p className="mt-1 text-muted-foreground">
                {t("policyPacks.planServicePolicy", {
                  classification: plan.servicePolicy.classification,
                  approval: plan.servicePolicy.requiresApproval
                    ? t("policyPacks.approvalYes")
                    : t("policyPacks.approvalNo"),
                  sla: plan.servicePolicy.slaProfileResolved
                    ? (plan.servicePolicy.slaProfileKey ??
                      t("policyPacks.slaNone"))
                    : t("policyPacks.slaMissing", {
                        key: plan.servicePolicy.slaProfileKey ?? "",
                      }),
                })}
              </p>
            ) : null}
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {plan.plannedAssignments.map((assignment) => (
                <li key={`${assignment.userId}:${assignment.roleKey}:${assignment.serviceId ?? ""}`}>
                  {t("policyPacks.grantRoleLine", {
                    role: t(`policyPacks.roles.${assignment.roleKey}`, {
                      defaultValue: assignment.roleKey,
                    }),
                    count: assignment.permissionKeys.length,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
          <Button
            variant="destructive"
            size="sm"
            disabled={isSaving || isChecking || packs.length === 0 || plan === null}
            onClick={() => void handleUnapply()}
          >
            {t("policyPacks.unapply")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isChecking || isSaving || packs.length === 0}
            onClick={() => void handleValidate()}
          >
            {isChecking ? t("policyPacks.validating") : t("policyPacks.validate")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={isSaving || isChecking || packs.length === 0 || plan === null}
            onClick={() => void handleApply()}
          >
            {isSaving ? t("policyPacks.applying") : t("policyPacks.apply")}
          </Button>
          {errorKey ? (
            <p role="alert" className={errorTextClassName}>
              {t(errorKey)}
            </p>
          ) : null}
          {unapplied ? (
            <p className={hintClassName}>
              {t("policyPacks.unapplyResult", {
                roles: unapplied.removedUserRoleCount,
                unit: unapplied.unboundOrganizationalUnit
                  ? t("policyPacks.unboundYes")
                  : t("policyPacks.unboundNo"),
                service: unapplied.unboundService
                  ? t("policyPacks.unboundYes")
                  : t("policyPacks.unboundNo"),
              })}
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
      </details>
    </Card>
  );
}
