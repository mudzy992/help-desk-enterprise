import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  controlCompactClassName,
  errorTextClassName,
} from "@/components/ui/control";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api";
import { updateUser, type UserSummary } from "@/services/users-api";

interface UserDetailFormProperties {
  readonly user: UserSummary;
  readonly unitOptions: readonly { id: string; label: string }[];
  readonly canManage: boolean;
  readonly onSaved: () => Promise<void>;
}

export function UserDetailForm({
  user,
  unitOptions,
  canManage,
  onSaved,
}: UserDetailFormProperties) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [organizationalUnitId, setOrganizationalUnitId] = useState(
    user.organizationalUnitId ?? "",
  );
  const [isActive, setIsActive] = useState(user.isActive);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user.displayName);
    setEmail(user.email);
    setOrganizationalUnitId(user.organizationalUnitId ?? "");
    setIsActive(user.isActive);
    setErrorMessage(null);
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateUser(user.id, {
        displayName,
        email: user.isLocalOnly ? email : undefined,
        organizationalUnitId: organizationalUnitId || null,
        isActive,
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : t("users.updateFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px]">
        <span className="text-muted-foreground">{t("users.displayNameLabel")}</span>
        <input
          className={controlCompactClassName}
          value={displayName}
          disabled={!canManage}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px]">
        <span className="text-muted-foreground">{t("users.emailLabel")}</span>
        <input
          className={controlCompactClassName}
          type="email"
          value={email}
          disabled={!canManage || !user.isLocalOnly}
          onChange={(event) => setEmail(event.target.value)}
        />
        {!user.isLocalOnly ? (
          <span className="text-[11px] text-muted-foreground/80">
            {t("users.emailDirectoryLocked")}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1 text-[12px]">
        <span className="text-muted-foreground">{t("users.ouLabel")}</span>
        <select
          className={controlCompactClassName}
          value={organizationalUnitId}
          disabled={!canManage}
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
        >
          <option value="">{t("users.ouNone")}</option>
          {unitOptions.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-muted-foreground">{t("users.activeLabel")}</span>
        <Switch
          checked={isActive}
          disabled={!canManage}
          onCheckedChange={setIsActive}
          aria-label={t("users.activeLabel")}
        />
      </label>
      {errorMessage ? (
        <p role="alert" className={errorTextClassName}>
          {errorMessage}
        </p>
      ) : null}
      {canManage ? (
        <Button
          type="button"
          size="sm"
          disabled={isSaving || displayName.trim().length === 0}
          onClick={() => void handleSave()}
        >
          {isSaving ? t("users.savingUser") : t("users.saveUser")}
        </Button>
      ) : null}
    </div>
  );
}
