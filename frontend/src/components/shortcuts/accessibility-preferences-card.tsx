import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { announce } from "@/lib/a11y/announcer";
import { queryKeys } from "@/lib/query/query-keys";
import { useShortcutsRegistry } from "@/lib/shortcuts/shortcuts-context";
import { getUserPreferences, updateUserPreferences, type UserPreferences } from "@/services/user-preferences-api";

type ShortcutChoice = "default" | "on" | "off";

function toChoice(value: boolean | null | undefined): ShortcutChoice {
  return value === true ? "on" : value === false ? "off" : "default";
}

function fromChoice(choice: ShortcutChoice): boolean | null {
  return choice === "on" ? true : choice === "off" ? false : null;
}

/**
 * Paket 2.8 §4.3 (WCAG 2.1.4): the user can switch single-key shortcuts off
 * (or on). Stored on the server, so it follows the user to every computer.
 */
export function AccessibilityPreferencesCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const registry = useShortcutsRegistry();
  const preferences = useQuery({ queryKey: queryKeys.userPreferences, queryFn: getUserPreferences });
  const mutation = useMutation({
    mutationFn: (choice: ShortcutChoice) => updateUserPreferences({ keyboardShortcuts: fromChoice(choice) }),
    onSuccess: (updated: UserPreferences) => {
      queryClient.setQueryData(queryKeys.userPreferences, updated);
      announce(
        updated.keyboardShortcutsEffective === true
          ? t("a11y.preferences.savedOn")
          : t("a11y.preferences.savedOff"),
      );
    },
  });

  const roleDefault = preferences.data?.keyboardShortcutsDefault ?? false;
  const choice = toChoice(preferences.data?.keyboardShortcuts);

  return (
    <Card id="accessibility" className="scroll-mt-20" data-testid="accessibility-preferences">
      <CardHeader title={t("a11y.preferences.heading")} subtitle={t("a11y.preferences.hint")} />
      <div className="grid gap-2.5 px-4 py-3.5">
        <p id="keyboard-shortcuts-label" className="text-[12.5px] font-medium text-foreground">
          {t("a11y.preferences.shortcutsLabel")}
        </p>
        <Segmented<ShortcutChoice>
          size="sm"
          ariaLabel={t("a11y.preferences.shortcutsLabel")}
          value={choice}
          onChange={(next) => mutation.mutate(next)}
          items={[
            {
              value: "default",
              label: roleDefault ? t("a11y.preferences.defaultOn") : t("a11y.preferences.defaultOff"),
            },
            { value: "on", label: t("a11y.preferences.on") },
            { value: "off", label: t("a11y.preferences.off") },
          ]}
        />
        <p className="text-[12px] leading-5 text-muted-foreground">{t("a11y.preferences.shortcutsHint")}</p>
        {mutation.isError ? (
          <p role="alert" className="text-[12px] font-medium text-danger">
            {t("a11y.preferences.saveError")}
          </p>
        ) : null}
        {registry !== null ? (
          <div>
            <button
              type="button"
              className="rounded-sm text-[12.5px] font-medium text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() => registry.openHelp()}
            >
              {t("a11y.preferences.showShortcuts")}
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
