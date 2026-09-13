import { type FormEvent, useEffect, useState } from "react";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import type { EmailTemplateRegistry } from "@/lib/settings/email-template-keys";
import {
  isEmailTemplateRegistryValid,
  parseEmailTemplateRegistry,
  serializeEmailTemplateRegistry,
} from "@/lib/settings/parse-email-template-registry";
import {
  emailChannelSettingKeys,
  getEmailChannelSettings,
  updateSetting,
  type EmailChannelSettings,
} from "@/services/settings-api";

export function useEmailChannelForm() {
  const [snapshot, setSnapshot] = useState<EmailChannelSettings | null>(null);
  const [templates, setTemplates] = useState<EmailTemplateRegistry | null>(null);
  const [channelEnabled, setChannelEnabled] = useState(false);
  const [templatesEnabled, setTemplatesEnabled] = useState(true);
  const [internalOnly, setInternalOnly] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState("");
  const [allowedEmails, setAllowedEmails] = useState("");
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void getEmailChannelSettings()
      .then((loaded) => {
        applySnapshot(loaded);
        setErrorKey(null);
      })
      .catch((error: unknown) => setErrorKey(mapApiError(error)));
  }, []);

  const applySnapshot = (loaded: EmailChannelSettings) => {
    setSnapshot(loaded);
    setChannelEnabled(loaded.channelEnabled);
    setTemplatesEnabled(loaded.templatesEnabled);
    setInternalOnly(loaded.internalOnly);
    setAllowedDomains(loaded.allowedExternalDomainsCsv);
    setAllowedEmails(loaded.allowedExternalEmailsCsv);
    setTemplates(parseEmailTemplateRegistry(loaded.templatesJson));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (snapshot === null || templates === null || !isEmailTemplateRegistryValid(templates)) {
      return;
    }
    setIsSaving(true);
    setErrorKey(null);
    try {
      for (const write of collectWrites()) {
        await updateSetting({ ...write, reason: reason.trim() });
      }
      applySnapshot(await getEmailChannelSettings());
      setReason("");
    } catch (error) {
      setErrorKey(mapApiError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const collectWrites = (): ReadonlyArray<{ key: string; value: string | boolean }> => {
    if (templates === null) {
      return [];
    }
    return [
      { key: emailChannelSettingKeys.channelEnabled, value: channelEnabled },
      { key: emailChannelSettingKeys.templatesEnabled, value: templatesEnabled },
      { key: emailChannelSettingKeys.internalOnly, value: internalOnly },
      { key: emailChannelSettingKeys.allowedExternalDomainsCsv, value: allowedDomains },
      { key: emailChannelSettingKeys.allowedExternalEmailsCsv, value: allowedEmails },
      {
        key: emailChannelSettingKeys.templatesJson,
        value: serializeEmailTemplateRegistry(templates),
      },
    ];
  };

  return {
    snapshot,
    templates,
    channelEnabled,
    templatesEnabled,
    internalOnly,
    allowedDomains,
    allowedEmails,
    reason,
    errorKey,
    isSaving,
    setChannelEnabled,
    setTemplatesEnabled,
    setInternalOnly,
    setAllowedDomains,
    setAllowedEmails,
    setReason,
    setTemplates,
    save,
  };
}
