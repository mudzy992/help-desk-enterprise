import { useTranslation } from "react-i18next";
import { UserAdminActions } from "@/components/users/user-admin-actions";
import { UserDetailForm } from "@/components/users/user-detail-form";
import { UserRolesSection } from "@/components/users/user-roles-section";
import { UserSecuritySection } from "@/components/users/user-security-section";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type {
  CreateUserResponse,
  UserSummary,
} from "@/services/users-api";

interface UserDetailDrawerProperties {
  readonly user: UserSummary | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly canManage: boolean;
  readonly canLinkDirectory: boolean;
  readonly isSelf: boolean;
  readonly originUnits: readonly { id: string; label: string }[];
  readonly services: readonly ServiceResponse[];
  readonly onChanged: () => Promise<void>;
  readonly onPasswordIssued: (result: CreateUserResponse) => void;
  readonly onDeleted: () => void;
}

export function UserDetailDrawer({
  user,
  open,
  onOpenChange,
  canManage,
  canLinkDirectory,
  isSelf,
  originUnits,
  services,
  onChanged,
  onPasswordIssued,
  onDeleted,
}: UserDetailDrawerProperties) {
  const { t } = useTranslation();
  if (user === null) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col overflow-y-auto p-0"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {user.displayName}
            <Badge tone={user.isLocalOnly ? "neutral" : "accent"} dot={false}>
              {user.isLocalOnly
                ? t("users.badgeLocal")
                : t("users.badgeDirectoryLinked")}
            </Badge>
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {user.email}
          </SheetDescription>
        </div>
        <div className="flex flex-col gap-6 px-5 py-4">
          <section>
            <h3 className="mb-3 text-[12px] font-medium text-foreground">
              {t("users.detailsHeading")}
            </h3>
            <UserDetailForm
              user={user}
              unitOptions={originUnits}
              canManage={canManage}
              onSaved={onChanged}
            />
          </section>
          <section>
            <h3 className="mb-2 text-[12px] font-medium text-foreground">
              {t("users.rolesHeading")}
            </h3>
            <div className="rounded-lg border border-border/70">
              <UserRolesSection
                userId={user.id}
                originUnits={originUnits}
                services={services}
              />
            </div>
          </section>
          {canManage && !isSelf ? (
            <section>
              <h3 className="mb-3 text-[12px] font-medium text-foreground">
                {t("users.security.heading")}
              </h3>
              <UserSecuritySection userId={user.id} />
            </section>
          ) : null}
          {canManage ? (
            <section>
              <h3 className="mb-3 text-[12px] font-medium text-foreground">
                {t("users.identityHeading")}
              </h3>
              <UserAdminActions
                user={user}
                canManage={canManage}
                canLinkDirectory={canLinkDirectory}
                isSelf={isSelf}
                layout="stack"
                onChanged={onChanged}
                onPasswordIssued={onPasswordIssued}
                onDeleted={() => {
                  onDeleted();
                  onOpenChange(false);
                }}
              />
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
