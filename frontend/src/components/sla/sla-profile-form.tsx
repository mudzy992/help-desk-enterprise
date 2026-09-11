import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName, textareaClassName } from "@/components/ui/control";
import { Switch } from "@/components/ui/switch";
import type { BusinessHoursCalendar, ProfileWriteInput, SlaProfile } from "@/services/sla-api";

interface SlaProfileFormProperties {
  readonly profile?: SlaProfile;
  readonly calendars: readonly BusinessHoursCalendar[];
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (input: ProfileWriteInput & { readonly key: string }) => Promise<void>;
}

export function SlaProfileForm({
  profile,
  calendars,
  errorKey,
  isSubmitting,
  onSubmit,
}: SlaProfileFormProperties) {
  const { t } = useTranslation();
  const [key, setKey] = useState(profile?.key ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [calendarId, setCalendarId] = useState(profile?.calendarId ?? calendars[0]?.id ?? "");
  const [isActive, setIsActive] = useState(profile?.isActive ?? true);
  const [reason, setReason] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ key, name, description, calendarId, isActive, reason });
    setReason("");
  };

  return (
    <form className="grid max-w-xl gap-3" onSubmit={submit}>
      {profile === undefined ? (
        <label className={labelClassName}>
          {t("sla.key")}
          <input className={controlClassName} value={key} onChange={(event) => setKey(event.target.value)} required />
        </label>
      ) : null}
      <label className={labelClassName}>
        {t("sla.name")}
        <input className={controlClassName} value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className={labelClassName}>
        {t("sla.description")}
        <textarea className={textareaClassName} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className={labelClassName}>
        {t("sla.calendar")}
        <select className={controlClassName} value={calendarId} onChange={(event) => setCalendarId(event.target.value)} required>
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>
              {calendar.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[12.5px] font-medium">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t("sla.active")}
      </label>
      <label className={labelClassName}>
        {t("sla.reason")}
        <input className={controlClassName} value={reason} onChange={(event) => setReason(event.target.value)} required />
      </label>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey as never)}</p> : null}
      <div>
        <Button type="submit" disabled={isSubmitting || calendarId.length === 0}>
          {isSubmitting ? t("sla.saving") : profile ? t("sla.saveProfile") : t("sla.createProfile")}
        </Button>
      </div>
    </form>
  );
}
