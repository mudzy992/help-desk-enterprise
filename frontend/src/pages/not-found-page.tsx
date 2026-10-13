import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={<Compass size={18} strokeWidth={1.8} />}
      title={t("app.notFound.title")}
      body={t("app.notFound.body")}
      action={
        <Button asChild size="sm">
          <Link to="/">{t("app.notFound.action")}</Link>
        </Button>
      }
    />
  );
}
