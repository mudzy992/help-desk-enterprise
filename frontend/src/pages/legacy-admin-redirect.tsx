import { Navigate, useSearchParams } from "react-router-dom";
import {
  buildAdminPath,
  type AdminTabKey,
} from "@/lib/admin/parse-admin-tab";

export function LegacyAdminRedirect({ tab }: { readonly tab: AdminTabKey }) {
  const [searchParams] = useSearchParams();
  return <Navigate to={buildAdminPath(tab, searchParams.toString())} replace />;
}
