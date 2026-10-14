import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  activeFormVersion,
  getServiceForm,
  type FormVersionResponse,
} from "@/services/service-catalog-api";

interface UseCreateTicketServiceFormProperties {
  readonly serviceId: string;
  readonly setDraft: Dispatch<SetStateAction<CreateTicketDraft>>;
  readonly setErrorKey: Dispatch<SetStateAction<TicketErrorKey | "tickets.errorCatalog" | null>>;
}

export function useCreateTicketServiceForm({
  serviceId,
  setDraft,
  setErrorKey,
}: UseCreateTicketServiceFormProperties) {
  const [activeForm, setActiveForm] = useState<FormVersionResponse | null>(null);
  const [formsEnabled, setFormsEnabled] = useState(true);
  const [requireVersionOnTicket, setRequireVersionOnTicket] = useState(true);

  useEffect(() => {
    if (serviceId.length === 0) {
      setActiveForm(null);
      setFormsEnabled(true);
      setRequireVersionOnTicket(true);
      return;
    }
    let cancelled = false;
    setActiveForm(null);
    setFormsEnabled(true);
    setRequireVersionOnTicket(true);
    void getServiceForm(serviceId)
      .then((form) => {
        if (cancelled) return;
        setFormsEnabled(form.formsEnabled);
        setRequireVersionOnTicket(form.requireVersionOnTicket);
        const active = form.formsEnabled ? activeFormVersion(form) : null;
        setActiveForm(active);
        setDraft((current) => ({
          ...current,
          formVersionRef: active?.formVersionRef ?? null,
          formData: active !== null && current.serviceId === serviceId ? current.formData : {},
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setActiveForm(null);
          setFormsEnabled(true);
          setRequireVersionOnTicket(true);
          setErrorKey("tickets.errorCatalog");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, setDraft, setErrorKey]);

  return { activeForm, formsEnabled, requireVersionOnTicket };
}
