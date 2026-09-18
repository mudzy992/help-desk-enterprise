import { useState } from "react";
import { mapSlaError } from "@/lib/sla/map-sla-error";
import type { useSlaPageData } from "@/lib/sla/use-sla-page-data";
import {
  createSlaProfile,
  createSlaRule,
  deleteSlaProfile,
  deleteSlaRule,
  updateSlaProfile,
  updateSlaRule,
  type ProfileWriteInput,
  type RuleWriteInput,
  type SlaRule,
} from "@/services/sla-api";

type SlaPageData = ReturnType<typeof useSlaPageData>;

export function useSlaPageMutations(data: SlaPageData, canWrite: boolean) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveProfile = async (
    input: ProfileWriteInput & { readonly key: string },
  ) => {
    if (!canWrite) return;
    setIsSubmitting(true);
    data.setErrorKey(null);
    try {
      if (data.selected === undefined) {
        const created = await createSlaProfile(input);
        data.setSelectedId(created.id);
      } else {
        await updateSlaProfile(data.selected.id, input);
      }
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveRule = async (input: RuleWriteInput, editing?: SlaRule) => {
    if (!canWrite || data.selected === undefined) return;
    setIsSubmitting(true);
    data.setErrorKey(null);
    try {
      if (editing === undefined) {
        await createSlaRule({ ...input, slaProfileId: data.selected.id });
      } else {
        await updateSlaRule(editing.id, input);
      }
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeRule = async (rule: SlaRule, reason: string) => {
    if (!canWrite || reason.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await deleteSlaRule(rule.id, reason.trim());
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeProfile = async (reason: string) => {
    if (!canWrite || data.selected === undefined || reason.trim().length === 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteSlaProfile(data.selected.id, reason.trim());
      data.clearSelection();
      await data.load();
    } catch (error) {
      data.setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isSubmitting, saveProfile, saveRule, removeRule, removeProfile };
}
