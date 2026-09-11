import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function UsersPage() {
  const { t } = useTranslation();
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.users")]}
        title={t("navigation.users")}
      />
      <EmptyState
        icon={<Users size={18} strokeWidth={1.8} />}
        title={t("placeholders.usersTitle")}
        body={t("placeholders.usersBody")}
      />
    </section>
  );
}
