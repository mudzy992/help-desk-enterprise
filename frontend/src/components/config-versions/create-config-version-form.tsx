import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { labelClassName, textareaClassName } from "@/components/ui/control";

interface CreateConfigVersionFormProperties {
  readonly isBusy: boolean;
  readonly onCreate: (releaseNotes: string) => Promise<boolean>;
}

export function CreateConfigVersionForm({
  isBusy,
  onCreate,
}: CreateConfigVersionFormProperties) {
  const { t } = useTranslation();
  const [releaseNotes, setReleaseNotes] = useState("");

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate(releaseNotes).then((created) => {
          if (created) {
            setReleaseNotes("");
          }
        });
      }}
    >
      <label className={labelClassName}>
        {t("configVersions.releaseNotes")}
        <textarea
          className={textareaClassName}
          value={releaseNotes}
          disabled={isBusy}
          maxLength={4000}
          onChange={(event) => setReleaseNotes(event.target.value)}
        />
      </label>
      <div>
        <Button type="submit" size="sm" disabled={isBusy}>
          {isBusy ? t("configVersions.creating") : t("configVersions.create")}
        </Button>
      </div>
    </form>
  );
}
