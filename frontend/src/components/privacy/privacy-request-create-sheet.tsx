import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { dateInputToIso, todayInputValue } from "@/lib/privacy/privacy-view";
import {
  createDataSubjectRequest,
  dataSubjectRequestChannels,
  dataSubjectRequestTypes,
  type DataSubjectRequest,
  type DataSubjectRequestChannel,
  type DataSubjectRequestType,
} from "@/services/privacy-api";
import type { UserSummary } from "@/services/users-api";
import { PersonPicker, usePrivacyFailure } from "./privacy-shared";
import { channelKey, requestTypeKey } from "./privacy-request-detail-sheet";

export function CreateRequestSheet({
  open,
  onOpenChange,
  users,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly users: readonly UserSummary[] | null;
  readonly onCreated: (request: DataSubjectRequest) => void;
}) {
  const { t } = useTranslation();
  const fail = usePrivacyFailure();
  const [type, setType] = useState<DataSubjectRequestType>("ACCESS");
  const [channel, setChannel] = useState<DataSubjectRequestChannel>("EMAIL");
  const [receivedAt, setReceivedAt] = useState(todayInputValue());
  const [subjectLabel, setSubjectLabel] = useState("");
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);
  const [handlerUserId, setHandlerUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType("ACCESS");
    setChannel("EMAIL");
    setReceivedAt(todayInputValue());
    setSubjectLabel("");
    setSubjectUserId(null);
    setHandlerUserId(null);
    setNotes("");
  }, [open]);

  const valid =
    subjectLabel.trim().length >= 2 && receivedAt.length === 10 && receivedAt <= todayInputValue();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      onCreated(
        await createDataSubjectRequest({
          type,
          channel,
          receivedAt: dateInputToIso(receivedAt),
          subjectLabel: subjectLabel.trim(),
          ...(subjectUserId !== null ? { subjectUserId } : {}),
          ...(handlerUserId !== null ? { handlerUserId } : {}),
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
        }),
      );
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full max-w-md flex-col overflow-y-auto p-0"
        data-testid="privacy-request-sheet"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {t("privacy.requests.create")}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {t("privacy.requests.createHint")}
          </SheetDescription>
        </div>
        <form className="flex flex-col gap-4 px-5 py-4" onSubmit={(event) => void submit(event)}>
          <Field label={t("privacy.requests.columns.type")} required>
            {(control) => (
              <Select
                {...control}
                value={type}
                onChange={(event) => setType(event.target.value as DataSubjectRequestType)}
              >
                {dataSubjectRequestTypes.map((value) => (
                  <option key={value} value={value}>
                    {t(requestTypeKey(value))}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("privacy.requests.form.channel")} required>
              {(control) => (
                <Select
                  {...control}
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as DataSubjectRequestChannel)}
                >
                  {dataSubjectRequestChannels.map((value) => (
                    <option key={value} value={value}>
                      {t(channelKey(value))}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("privacy.requests.form.receivedAt")} required>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={receivedAt}
                  max={todayInputValue()}
                  onChange={(event) => setReceivedAt(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field
            label={t("privacy.requests.form.subjectLabel")}
            hint={t("privacy.requests.form.subjectLabelHint")}
            required
          >
            {(control) => (
              <Input
                {...control}
                value={subjectLabel}
                maxLength={200}
                onChange={(event) => setSubjectLabel(event.target.value)}
                data-testid="privacy-request-subject-label"
              />
            )}
          </Field>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-foreground">
              {t("privacy.requests.form.subjectUser")}
            </p>
            <PersonPicker
              id="privacy-request-subject"
              users={users}
              value={subjectUserId}
              onChange={(user) => {
                setSubjectUserId(user?.id ?? null);
                if (user !== null && subjectLabel.trim().length === 0)
                  setSubjectLabel(user.displayName);
              }}
            />
            <p className={`${hintClassName} mt-1`}>{t("privacy.requests.form.subjectUserHint")}</p>
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-foreground">
              {t("privacy.requests.columns.handler")}
            </p>
            <PersonPicker
              id="privacy-request-handler"
              users={users}
              value={handlerUserId}
              filter={(user) => user.isActive && user.roleTone !== "user"}
              onChange={(user) => setHandlerUserId(user?.id ?? null)}
            />
          </div>
          <Field
            label={t("privacy.requests.form.notes")}
            hint={t("privacy.requests.form.notesHint")}
          >
            {(control) => (
              <Textarea
                {...control}
                value={notes}
                maxLength={4000}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </Field>
          <p className={hintClassName}>{t("privacy.requests.form.deadlineHint")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("ui.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!valid || busy}
              data-testid="privacy-request-save"
            >
              {t("privacy.requests.form.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
