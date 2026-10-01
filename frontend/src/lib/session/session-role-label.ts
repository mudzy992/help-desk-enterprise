export function sessionRoleLabelKey(
  roleKeys: readonly string[],
  isSuperAdmin: boolean,
):
  | "shell.roles.superAdmin"
  | "shell.roles.admin"
  | "shell.roles.agent"
  | "shell.roles.assetManager"
  | "shell.roles.problemManager"
  | "shell.roles.user" {
  if (isSuperAdmin || roleKeys.includes("SUPER_ADMIN")) {
    return "shell.roles.superAdmin";
  }
  if (roleKeys.includes("ADMIN")) {
    return "shell.roles.admin";
  }
  if (roleKeys.includes("PROBLEM_MANAGER")) {
    return "shell.roles.problemManager";
  }
  if (roleKeys.includes("AGENT")) {
    return "shell.roles.agent";
  }
  if (roleKeys.includes("ASSET_MANAGER")) {
    return "shell.roles.assetManager";
  }
  return "shell.roles.user";
}
