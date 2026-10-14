import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import {
  canPersistCreateTicketDraft,
  clearSessionValue,
  CREATE_TICKET_DRAFT_STORAGE_KEY,
  isPersistedCreateTicketDraft,
  readSessionValue,
  restorePersistedCreateTicketDraft,
  toPersistedCreateTicketDraft,
  writeSessionValue,
} from "@/lib/tickets/ticket-draft-storage";
import type { ServiceResponse } from "@/services/service-catalog-api";

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
  const [savedDraft] = useState(() =>
    readSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY, isPersistedCreateTicketDraft),
  );
  const [draftStorageReady, setDraftStorageReady] = useState(false);

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
    } else if (savedDraft !== null) {
      clearSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY);
    }
    setDraftStorageReady(true);
  }, [draftStorageReady, hasDeepLinkPrefill, isCatalogLoading, savedDraft, services, setDraft]);

  useEffect(() => {
    if (!draftStorageReady) return;
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
      clearSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY);
      return;
    }
    writeSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY, persisted);
  }, [
    draft.impact,
    draft.originUnitId,
    draft.serviceId,
    draft.urgency,
    draftStorageReady,
    selectedService,
  ]);

  return draftStorageReady;
}
