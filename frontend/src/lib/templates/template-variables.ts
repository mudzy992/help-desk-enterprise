import { responseTemplateVariables, type ResponseTemplateVariable } from "@/services/templates-api";

/** Same syntax as the backend (`{{ name }}`), kept in sync by the specs. */
const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
const known = new Set<string>(responseTemplateVariables);

export function extractTemplateVariables(body: string): readonly string[] {
  const names = new Set<string>();
  for (const match of body.matchAll(placeholderPattern)) {
    names.add(match[1]);
  }
  return [...names];
}

/** Names the backend would reject (TEMPLATE_UNKNOWN_VARIABLE). */
export function unknownTemplateVariables(body: string): readonly string[] {
  return extractTemplateVariables(body).filter((name) => !known.has(name));
}

export function isKnownTemplateVariable(name: string): name is ResponseTemplateVariable {
  return known.has(name);
}

export function placeholderFor(variable: ResponseTemplateVariable): string {
  return `{{${variable}}}`;
}

/** Tags typed as "vpn, mreža ,  VPN" → ["vpn", "mreža"] (backend normalizes the same way). */
export function parseTagsInput(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.replace(/\s+/g, " ").trim().toLocaleLowerCase("bs"))
        .filter((tag) => tag.length > 0),
    ),
  ];
}
