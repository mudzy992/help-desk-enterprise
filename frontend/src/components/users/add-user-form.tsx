import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, errorTextClassName } from "@/components/ui/control";
import { roleKeys } from "@/lib/session/permission-keys";
import { ApiError } from "@/services/api";
import { createUser } from "@/services/users-api";

interface AddUserFormProperties {
  readonly unitOptions: readonly { id: string; label: string }[];
  readonly onCreated: () => Promise<void>;
  readonly onCancel: () => void;
}

export function AddUserForm({
  unitOptions,
  onCreated,
  onCancel,
}: AddUserFormProperties) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationalUnitId, setOrganizationalUnitId] = useState("");
  const [roleKey, setRoleKey] = useState<string>(roleKeys.user);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await createUser({
        displayName,
        email,
        organizationalUnitId: organizationalUnitId || null,
        roleKey,
      });
      await onCreated();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : t("users.createFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-border/60 px-4 py-3">
      <input
        className={`${controlCompactClassName} w-full`}
        value={displayName}
        placeholder={t("users.displayNamePlaceholder")}
        aria-label={t("users.displayNamePlaceholder")}
        onChange={(event) => setDisplayName(event.target.value)}
      />
      <input
        className={`${controlCompactClassName} w-full`}
        type="email"
        value={email}
        placeholder={t("users.emailPlaceholder")}
        aria-label={t("users.emailPlaceholder")}
        onChange={(event) => setEmail(event.target.value)}
      />
      <select
        className={`${controlCompactClassName} w-full`}
        value={organizationalUnitId}
        aria-label={t("users.organizationalUnitSelect")}
        onChange={(event) => setOrganizationalUnitId(event.target.value)}
      >
        <option value="">{t("users.scopeAnyOrganizationalUnit")}</option>
        {unitOptions.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.label}
          </option>
        ))}
      </select>
      <select
        className={`${controlCompactClassName} w-full`}
        value={roleKey}
        aria-label={t("users.roleSelect")}
        onChange={(event) => setRoleKey(event.target.value)}
      >
        <option value={roleKeys.user}>USER</option>
        <option value={roleKeys.agent}>AGENT</option>
        <option value={roleKeys.admin}>ADMIN</option>
        <option value={roleKeys.superAdmin}>SUPER_ADMIN</option>
      </select>
      {errorMessage ? (
        <p role="alert" className={errorTextClassName}>
          {errorMessage}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={isSaving || displayName.trim().length === 0 || email.trim().length === 0}
          onClick={() => void handleSubmit()}
        >
          <Plus size={14} /> {t("users.saveUser")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t("settings.drawer.cancel")}
        </Button>
      </div>
    </div>
  );
}
