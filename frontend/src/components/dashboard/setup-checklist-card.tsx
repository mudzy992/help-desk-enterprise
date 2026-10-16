import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SetupChecklistItemRow } from "@/components/dashboard/setup-checklist-item";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  dismissSetupChecklist,
  loadSetupChecklist,
  type SetupChecklistStatus,
} from "@/services/setup-checklist-api";

/*
  Install wizard v2 (F6.3): what the wizard promised to „configure later“, on the
  screen the operator opens every day. Every item is derived by the backend, so
  the card never keeps its own list: an item disappears because the thing behind
  it exists (SMTP configured, team invited, recommendation applied).

  A failed read hides the card instead of adding a second error to a dashboard
  that already reports its own — the checklist is an offer, not a gate.
*/

export function SetupChecklistCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SetupChecklistStatus | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    let isActive = true;
    loadSetupChecklist()
      .then((next) => {
        if (isActive) setStatus(next);
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, []);

  if (status === null || status.dismissedAt !== null || status.items.length === 0) {
    return null;
  }

  const onDismiss = async () => {
    setIsDismissing(true);
    try {
      setStatus(await dismissSetupChecklist());
    } catch {
      // Dismissing is reversible (Settings keeps the state): a failure simply
      // leaves the card where it is.
      setIsDismissing(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader
        title={t("dashboard.setupChecklist.title")}
        subtitle={t("dashboard.setupChecklist.subtitle", { count: status.items.length })}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDismissing}
            onClick={() => void onDismiss()}
          >
            <X aria-hidden="true" size={13} />
            {t("dashboard.setupChecklist.dismiss")}
          </Button>
        }
      />
      <CardBody className="py-3">
        <ul>
          {status.items.map((item) => (
            <SetupChecklistItemRow key={item.key} item={item} />
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
