import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";
import { controlClassName, hintClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import {
  localizePersonName,
  matchesPersonQuery,
  needsIdentityCode,
  readPrivacyErrorCode,
  type PrivacyErrorCode,
} from "@/lib/privacy/privacy-view";
import { ApiError } from "@/services/api";
import { listUsersSummary, type UserSummary } from "@/services/users-api";

/** i18n key of a privacy error code (`privacy.errors.*`). */
export function privacyErrorKey(code: PrivacyErrorCode) {
  return `privacy.errors.${code}` as "privacy.errors.PRIVACY_DISABLED";
}

/** One toast for any failure: the domain message when known, the generic one otherwise. */
export function usePrivacyFailure() {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(
    (caught: unknown) => {
      const code = readPrivacyErrorCode(caught);
      toast({ title: code === null ? t(mapApiError(caught)) : t(privacyErrorKey(code)), tone: "danger" });
    },
    [t, toast],
  );
}

type PendingConfirmation = {
  readonly title: string;
  readonly run: (code: string) => Promise<void>;
};

/**
 * §6.1 / §5.1: sensitive actions need identity confirmation. The action is
 * first tried without a code — users without MFA pass on a fresh session; on
 * IDENTITY_CONFIRMATION_REQUIRED the code dialog opens and the action is
 * retried with the code. Other errors go to `onError`.
 */
export function useIdentityGuard(onError: (caught: unknown) => void) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const guard = useCallback(
    async (title: string, action: (code?: string) => Promise<void>) => {
      try {
        await action(undefined);
      } catch (caught) {
        if (!needsIdentityCode(caught)) {
          onError(caught);
          return;
        }
        setPending({
          title,
          run: async (code) => {
            try {
              await action(code);
              setPending(null);
            } catch (retryError) {
              if (readPrivacyErrorCode(retryError) === "IDENTITY_CONFIRMATION_FAILED") {
                // The form shows "invalid code" for a 401.
                throw new ApiError(401, "IDENTITY_CONFIRMATION_FAILED", "invalid");
              }
              setPending(null);
              onError(retryError);
            }
          },
        });
      }
    },
    [onError],
  );

  const dialog = (
    <Modal open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <ModalContent data-testid="privacy-identity-dialog">
        <ModalTitle className="pr-6 text-[14px] font-semibold leading-5 text-foreground">
          {pending?.title ?? ""}
        </ModalTitle>
        <ModalDescription className="mb-3 mt-1 text-[12.5px] leading-5 text-muted-foreground">
          {t("privacy.identity.body")}
        </ModalDescription>
        {pending !== null ? (
          <MfaCodeForm
            idPrefix="privacy-identity"
            submitLabel={t("privacy.identity.confirm")}
            onSubmit={pending.run}
            onCancel={() => setPending(null)}
          />
        ) : null}
      </ModalContent>
    </Modal>
  );

  return { guard, dialog };
}

/** Users for the person pickers — the admin list, loaded once per mount. */
export function useUserDirectory(enabled = true) {
  const [users, setUsers] = useState<readonly UserSummary[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listUsersSummary()
      .then((loaded) => !cancelled && setUsers(loaded))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return users;
}

interface PersonPickerProperties {
  readonly id: string;
  readonly users: readonly UserSummary[] | null;
  readonly value: string | null;
  readonly onChange: (user: UserSummary | null) => void;
  readonly placeholder?: string;
  readonly filter?: (user: UserSummary) => boolean;
  readonly testId?: string;
}

/** Search by name or e-mail; at most 8 suggestions, the choice shown as a line. */
export function PersonPicker({ id, users, value, onChange, placeholder, filter, testId }: PersonPickerProperties) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const selected = users?.find((user) => user.id === value) ?? null;
  const matches = useMemo(
    () =>
      query.trim().length === 0 || users === null
        ? []
        : users.filter((user) => (filter ? filter(user) : true) && matchesPersonQuery(user, query)).slice(0, 8),
    [filter, query, users],
  );

  if (selected !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px]">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{localizePersonName(selected.displayName, i18n.language)}</span>
          <span className="ml-2 text-muted-foreground">{selected.email}</span>
        </span>
        <button
          type="button"
          className="shrink-0 text-[12px] text-link hover:underline"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
        >
          {t("privacy.picker.change")}
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        id={id}
        className={controlClassName}
        value={query}
        placeholder={placeholder ?? t("privacy.picker.placeholder")}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        data-testid={testId}
        disabled={users === null}
      />
      {matches.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-pop">
          {matches.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="flex w-full flex-col px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-hover"
                onClick={() => onChange(user)}
              >
                <span className="font-medium text-foreground">{localizePersonName(user.displayName, i18n.language)}</span>
                <span className={hintClassName}>
                  {user.email}
                  {user.isActive ? "" : ` · ${t("privacy.picker.inactive")}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length > 0 && users !== null ? (
        <p className={`${hintClassName} mt-1`}>{t("privacy.picker.none")}</p>
      ) : null}
    </div>
  );
}

export function PanelIntro({ children, actions }: { readonly children: ReactNode; readonly actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <p className={`${hintClassName} max-w-3xl leading-5`}>{children}</p>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function useDateFormat() {
  const { i18n } = useTranslation();
  return useMemo(
    () => ({
      date: (value: string | null) =>
        value === null
          ? "—"
          : new Date(value).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" }),
      dateTime: (value: string | null) =>
        value === null
          ? "—"
          : new Date(value).toLocaleString(i18n.language, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
    }),
    [i18n.language],
  );
}
