import { KeyRound, Link2, Link2Off, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LinkDirectoryIdentityDialog } from "@/components/users/link-directory-identity-dialog";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { ApiError } from "@/services/api";
import {
  deleteUser,
  resetUserTemporaryPassword,
  unlinkUserDirectoryIdentity,
  type CreateUserResponse,
  type UserSummary,
} from "@/services/users-api";

interface UserAdminActionsProperties {
  readonly user: UserSummary;
  readonly canManage: boolean;
  readonly canLinkDirectory: boolean;
  readonly isSelf: boolean;
  readonly layout?: "end" | "stack";
  readonly onChanged: () => Promise<void>;
  readonly onPasswordIssued: (result: CreateUserResponse) => void;
  readonly onDeleted?: () => void;
}

export function UserAdminActions({
  user,
  canManage,
  canLinkDirectory,
  isSelf,
  layout = "end",
  onChanged,
  onPasswordIssued,
  onDeleted,
}: UserAdminActionsProperties) {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  if (!canManage) {
    return null;
  }

  const handleResetPassword = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await resetUserTemporaryPassword(user.id);
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

  const handleUnlink = async () => {
    if (
      !window.confirm(
        t("users.unlinkDirectoryConfirm", { name: user.displayName }),
      )
    ) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await unlinkUserDirectoryIdentity(user.id);
      onPasswordIssued(response);
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : t("users.unlinkDirectoryFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("users.deleteConfirm", { name: user.displayName }))) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await deleteUser(user.id);
      await onChanged();
      onDeleted?.();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : t("users.deleteFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className={`flex flex-col gap-1 ${layout === "end" ? "items-end" : "items-stretch"}`}
    >
      <div
        className={`flex flex-wrap gap-1 ${layout === "end" ? "justify-end" : ""}`}
      >
        {user.isLocalOnly ? (
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={isBusy}
            onClick={() => void handleResetPassword()}
          >
            <KeyRound size={13} /> {t("users.resetPassword")}
          </Button>
        ) : null}
        {canLinkDirectory && user.isLocalOnly && user.roleTone !== "super" ? (
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={isBusy}
            onClick={() => setLinkOpen(true)}
          >
            <Link2 size={13} /> {t("users.linkDirectory")}
          </Button>
        ) : null}
        {canLinkDirectory && !user.isLocalOnly ? (
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={isBusy}
            onClick={() => void handleUnlink()}
          >
            <Link2Off size={13} /> {t("users.unlinkDirectory")}
          </Button>
        ) : null}
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
      <LinkDirectoryIdentityDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        user={user}
        onLinked={onChanged}
      />
    </div>
  );
}
