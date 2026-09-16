import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { ApiError } from "@/services/api";
import {
  deleteUser,
  resetUserTemporaryPassword,
  type CreateUserResponse,
} from "@/services/users-api";

interface UserAdminActionsProperties {
  readonly userId: string;
  readonly userDisplayName: string;
  readonly canManage: boolean;
  readonly isSelf: boolean;
  readonly onChanged: () => Promise<void>;
  readonly onPasswordIssued: (result: CreateUserResponse) => void;
}

export function UserAdminActions({
  userId,
  userDisplayName,
  canManage,
  isSelf,
  onChanged,
  onPasswordIssued,
}: UserAdminActionsProperties) {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!canManage) {
    return null;
  }

  const handleResetPassword = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await resetUserTemporaryPassword(userId);
      onPasswordIssued(response);
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : t("users.resetPasswordFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(t("users.deleteConfirm", { name: userDisplayName }))
    ) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await deleteUser(userId);
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : t("users.deleteFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={isBusy}
          onClick={() => void handleResetPassword()}
        >
          <KeyRound size={13} /> {t("users.resetPassword")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={isBusy || isSelf}
          onClick={() => void handleDelete()}
        >
          <Trash2 size={13} /> {t("users.deleteUser")}
        </Button>
      </div>
      {errorMessage ? (
        <p role="alert" className={errorTextClassName}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
