import type { DirectorySyncPlan } from "@/services/directory-sync-api";

/*
  Paket 1.8 (A4): the dry-run plan exported as one CSV for the change record.
  Columns: section, action, email, name, organizational unit / role, detail.
  Values are quoted and formula-leading characters are neutralised so the file
  is safe to open in Excel (CSV injection).
*/

export const DIRECTORY_PLAN_CSV_HEADER = [
  "section",
  "action",
  "email",
  "name",
  "target",
  "detail",
] as const;

function cell(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values: readonly (string | null | undefined)[]): string {
  return values.map(cell).join(";");
}

export function buildDirectoryPlanCsv(plan: DirectorySyncPlan): string {
  const lines: string[] = [row(DIRECTORY_PLAN_CSV_HEADER)];
  for (const unit of plan.organizationalUnits.create) {
    lines.push(row(["ou", "create", null, unit.name, unit.path, unit.distinguishedName]));
  }
  for (const unit of plan.organizationalUnits.update) {
    lines.push(row(["ou", "update", null, unit.name, unit.path, (unit.changes ?? []).join(", ")]));
  }
  for (const user of plan.users.create) {
    lines.push(row(["user", "create", user.email, user.displayName, user.ouPath, user.distinguishedName]));
  }
  for (const user of plan.users.update) {
    lines.push(row(["user", "update", user.email, user.displayName, user.ouPath, (user.changes ?? []).join(", ")]));
  }
  for (const user of plan.users.reactivate) {
    lines.push(row(["user", "reactivate", user.email, user.displayName, user.ouPath, (user.changes ?? []).join(", ")]));
  }
  for (const user of plan.users.deactivate) {
    lines.push(row(["user", "deactivate", user.email, user.displayName, null, user.reason]));
  }
  for (const grant of plan.roles.grant) {
    lines.push(row(["role", "grant", grant.email, null, `${grant.roleKey} @ ${grant.ouPath}`, null]));
  }
  for (const revoke of plan.roles.revoke) {
    lines.push(row(["role", "revoke", revoke.email, null, revoke.roleKey, null]));
  }
  for (const exception of plan.exceptions) {
    lines.push(row(["exception", exception.code, exception.email, null, exception.distinguishedName, exception.detail]));
  }
  // BOM so Excel detects UTF-8 (č, ć, š, ž, đ); CRLF per RFC 4180.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadDirectoryPlanCsv(plan: DirectorySyncPlan, runId: string): void {
  const blob = new Blob([buildDirectoryPlanCsv(plan)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `directory-sync-plan-${runId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
