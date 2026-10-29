import { useRef, useState } from "react";
import { createOperationGuard } from "@/lib/async/operation-guard";
import { readApiRequestId } from "@/lib/map-api-error";
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
type SlaMutationAction = "profile-save" | "profile-delete" | "rule-save" | "rule-delete";

export function useSlaPageMutations(data: SlaPageData, canWrite: boolean) {
  const guard = useRef(createOperationGuard());
  const [pendingAction, setPendingAction] = useState<SlaMutationAction | null>(null);
  const mutate = async (action: SlaMutationAction, operation: () => Promise<void>) => {
    if (guard.current.isPending(action)) return;
    await guard.current.run(action, async () => {
      setPendingAction(action);
      data.setMutationError(null);
      try {
        await operation();
      } catch (error) {
        data.setMutationError({ key: mapSlaError(error), requestId: readApiRequestId(error) });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const saveProfile = async (input: ProfileWriteInput & { readonly key: string }) => {
    if (!canWrite) return;
    await mutate("profile-save", async () => {
      if (data.selected === undefined) {
        const created = await createSlaProfile(input);
        data.setSelectedId(created.id);
      } else {
        await updateSlaProfile(data.selected.id, input);
      }
      await data.load();
    });
  };

  const saveRule = async (input: RuleWriteInput, editing?: SlaRule) => {
    if (!canWrite || data.selected === undefined) return;
    await mutate("rule-save", async () => {
      if (editing === undefined) await createSlaRule({ ...input, slaProfileId: data.selected!.id });
      else await updateSlaRule(editing.id, input);
      await data.reloadSelected();
    });
  };

  const removeRule = async (rule: SlaRule, reason: string) => {
    if (!canWrite || reason.trim().length === 0) return;
    await mutate("rule-delete", async () => {
      await deleteSlaRule(rule.id, reason.trim());
      await data.reloadSelected();
    });
  };

  const removeProfile = async (reason: string) => {
    if (!canWrite || data.selected === undefined || reason.trim().length === 0) return;
    await mutate("profile-delete", async () => {
      await deleteSlaProfile(data.selected!.id, reason.trim());
      data.clearSelection();
      await data.load();
    });
  };

  return {
    isSubmitting: pendingAction !== null,
    pendingAction,
    saveProfile,
    saveRule,
    removeRule,
    removeProfile,
  };
}
