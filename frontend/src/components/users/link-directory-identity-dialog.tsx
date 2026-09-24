import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError } from "@/services/api";
import {
  listDirectoryUsersForLinking,
  type DirectoryUserForLinking,
} from "@/services/directory-sync-api";
import {
  linkUserDirectoryIdentity,
  type UserSummary,
} from "@/services/users-api";

interface LinkDirectoryIdentityDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly user: UserSummary;
  readonly onLinked: () => Promise<void>;
}

export function LinkDirectoryIdentityDialog({
  open,
  onOpenChange,
  user,
  onLinked,
}: LinkDirectoryIdentityDialogProperties) {
  const { t } = useTranslation();
  const [catalogUsers, setCatalogUsers] = useState<
    readonly DirectoryUserForLinking[]
  >([]);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedExternalId(null);
    setErrorMessage(null);
    setIsLoading(true);
    void listDirectoryUsersForLinking()
      .then((users) => setCatalogUsers(users))
      .catch((error: unknown) => {
        setCatalogUsers([]);
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : t("users.linkDirectoryLoadFailed"),
        );
      })
      .finally(() => setIsLoading(false));
  }, [open, t]);

  const selected = catalogUsers.find(
    (entry) => entry.externalId === selectedExternalId,
  );

  const handleConfirm = async () => {
    if (selected === undefined) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await linkUserDirectoryIdentity(user.id, selected.externalId);
      await onLinked();
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : t("users.linkDirectoryFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col overflow-y-auto p-5"
      >
        <SheetTitle>{t("users.linkDirectoryTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("users.linkDirectoryHint")}
        </SheetDescription>
        <div className="mt-4 grid gap-3 rounded-lg border border-border/70 p-3 text-[12px]">
          <p className="font-medium text-foreground">
            {t("users.linkDirectoryLocalLabel")}
          </p>
          <p>{user.displayName}</p>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[12px] font-medium text-foreground">
            {t("users.linkDirectoryCatalogLabel")}
          </p>
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground">
              {t("users.linkDirectoryLoading")}
            </p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {catalogUsers.map((entry) => (
                <li key={entry.externalId}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-2.5 py-2 text-left text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70 ${
                      selectedExternalId === entry.externalId
                        ? "border-primary bg-primary/10"
                        : "border-border/70 hover:bg-surface-hover"
                    }`}
                    onClick={() => setSelectedExternalId(entry.externalId)}
                  >
                    <span className="block font-medium">{entry.displayName}</span>
                    <span className="block text-muted-foreground">
                      {entry.email ?? entry.externalId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selected ? (
          <div className="mt-4 grid gap-2 rounded-lg border border-border/70 p-3 text-[12px]">
            <p className="font-medium">{t("users.linkDirectoryConfirmCompare")}</p>
            <p>
              {user.displayName} ({user.email}) → {selected.displayName} (
              {selected.email ?? selected.externalId})
            </p>
          </div>
        ) : null}
        {errorMessage ? (
          <p role="alert" className={`mt-3 ${errorTextClassName}`}>
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("users.linkDirectoryCancel")}
          </Button>
          <Button
            type="button"
            disabled={selected === undefined || isSaving}
            onClick={() => void handleConfirm()}
          >
            {t("users.linkDirectoryConfirm")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
