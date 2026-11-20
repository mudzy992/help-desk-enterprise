import { useTranslation } from "react-i18next";
import { hintClassName } from "@/components/ui/control";
import type { ChangeOptions } from "@/services/changes-api";

/**
 * W7.76 (`BA-changes-18`): the form cannot page, so the server names the pickers
 * it had to cut. Without this line a requester looks for a unit, service, CAB
 * group or template that exists but is not in the list, and concludes it does
 * not exist.
 */
export function ChangeFormOptionsHint({ options }: { readonly options: ChangeOptions }) {
  const { t } = useTranslation();
  const truncated = options.truncated;
  if (
    truncated === undefined ||
    !(truncated.units || truncated.services || truncated.cabGroups || truncated.templates)
  ) {
    return null;
  }
  return (
    <p
      role="status"
      className={`mt-3 ${hintClassName}`}
      data-testid="change-form-options-truncated"
    >
      {t("changes.form.optionsTruncated")}
    </p>
  );
}
