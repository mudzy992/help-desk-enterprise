import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import {
  canPersistCreateTicketDraft,
  clearSessionValue,
  createTicketDraftStorageKey,
  isPersistedCreateTicketDraft,
  readSessionValue,
  restorePersistedCreateTicketDraft,
  toPersistedCreateTicketDraft,
  writeSessionValue,
} from "@/lib/tickets/ticket-draft-storage";
import type { ServiceResponse } from "@/services/service-catalog-api";
import { useSession } from "@/lib/session/use-session";

interface UseCreateTicketDraftPersistenceProperties {
  readonly isCatalogLoading: boolean;
  readonly hasDeepLinkPrefill: boolean;
  readonly services: readonly ServiceResponse[];
  readonly selectedService: ServiceResponse | null;
  readonly draft: CreateTicketDraft;
  readonly setDraft: Dispatch<SetStateAction<CreateTicketDraft>>;
}

export function useCreateTicketDraftPersistence({
  isCatalogLoading,
  hasDeepLinkPrefill,
  services,
  selectedService,
  draft,
  setDraft,
}: UseCreateTicketDraftPersistenceProperties): boolean {
  const { currentUserId } = useSession();
  const storageKey = currentUserId === null ? null : createTicketDraftStorageKey(currentUserId);
  const readSavedDraft = () =>
    storageKey === null ? null : readSessionValue(storageKey, isPersistedCreateTicketDraft);
  const [loadedStorageKey, setLoadedStorageKey] = useState(storageKey);
  const [savedDraft, setSavedDraft] = useState(readSavedDraft);
  const [draftStorageReady, setDraftStorageReady] = useState(false);
  if (loadedStorageKey !== storageKey) {
    setLoadedStorageKey(storageKey);
    setSavedDraft(readSavedDraft());
    setDraftStorageReady(false);
  }

  useEffect(() => {
    if (isCatalogLoading || draftStorageReady) return;
    const savedService =
      savedDraft === null
        ? null
        : (services.find((service) => service.id === savedDraft.serviceId) ?? null);
    const restored =
      !hasDeepLinkPrefill && savedDraft !== null && canPersistCreateTicketDraft(savedService)
        ? restorePersistedCreateTicketDraft(savedDraft, savedService)
        : null;
    if (restored !== null) {
      setDraft((current) => ({ ...current, ...restored }));
    } else if (savedDraft !== null && storageKey !== null) {
      clearSessionValue(storageKey);
    }
    setDraftStorageReady(true);
  }, [
    draftStorageReady,
    hasDeepLinkPrefill,
    isCatalogLoading,
    savedDraft,
    services,
    setDraft,
    storageKey,
  ]);

  useEffect(() => {
    if (!draftStorageReady || storageKey === null) return;
    const persisted = toPersistedCreateTicketDraft(
      {
        serviceId: draft.serviceId,
        originUnitId: draft.originUnitId,
        impact: draft.impact,
        urgency: draft.urgency,
      },
      selectedService,
    );
    if (persisted === null) {
      clearSessionValue(storageKey);
      return;
    }
    writeSessionValue(storageKey, persisted);
  }, [
    draft.impact,
    draft.originUnitId,
    draft.serviceId,
    draft.urgency,
    draftStorageReady,
    selectedService,
    storageKey,
  ]);

  return draftStorageReady;
}
