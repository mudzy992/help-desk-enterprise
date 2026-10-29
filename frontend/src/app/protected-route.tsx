import { RequireAccess } from "@/components/layout/require-access";
import { navigationIconFor } from "@/lib/navigation-icons";
import type { ProtectedRouteDescriptor } from "@/app/protected-route-catalog";

export function ProtectedRoute({ descriptor }: { readonly descriptor: ProtectedRouteDescriptor }) {
  const Icon = navigationIconFor(descriptor.iconPath);
  const Page = descriptor.Page;
  return (
    <RequireAccess
      check={descriptor.check}
      forbiddenTitleKey={descriptor.forbiddenTitleKey}
      forbiddenBodyKey={descriptor.forbiddenBodyKey}
      icon={<Icon size={18} strokeWidth={1.8} />}
    >
      <Page />
    </RequireAccess>
  );
}
