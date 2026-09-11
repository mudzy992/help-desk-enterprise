export function sessionRoleLabelKey(
  roleKeys: readonly string[],
  isSuperAdmin: boolean,
):
  | "shell.roles.superAdmin"
  | "shell.roles.admin"
  | "shell.roles.agent"
  | "shell.roles.user" {
  if (isSuperAdmin || roleKeys.includes("SUPER_ADMIN")) {
    return "shell.roles.superAdmin";
  }
  if (roleKeys.includes("ADMIN")) {
    return "shell.roles.admin";
  }
  if (roleKeys.includes("AGENT")) {
    return "shell.roles.agent";
  }
  return "shell.roles.user";
}
