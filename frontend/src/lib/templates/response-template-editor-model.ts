import type {
  ResponseTemplate,
  ResponseTemplateKind,
  SaveResponseTemplateInput,
} from "@/services/templates-api";
import { parseTagsInput } from "./template-variables";

export type ResponseTemplateForm = {
  name: string;
  kind: ResponseTemplateKind;
  bodyBs: string;
  bodyEn: string;
  tags: string;
  isActive: boolean;
  serviceIds: readonly string[];
  categoryIds: readonly string[];
  groupIds: readonly string[];
  reason: string;
};

export const emptyResponseTemplateForm: ResponseTemplateForm = {
  name: "",
  kind: "REPLY",
  bodyBs: "",
  bodyEn: "",
  tags: "",
  isActive: true,
  serviceIds: [],
  categoryIds: [],
  groupIds: [],
  reason: "",
};

export type ResponseTemplateBodyField = "bodyBs" | "bodyEn";

export function toResponseTemplateForm(template: ResponseTemplate): ResponseTemplateForm {
  return {
    name: template.name,
    kind: template.kind,
    bodyBs: template.bodyBs,
    bodyEn: template.bodyEn ?? "",
    tags: template.tags.join(", "),
    isActive: template.isActive,
    serviceIds: template.serviceIds,
    categoryIds: template.categoryIds,
    groupIds: template.groupIds,
    reason: "",
  };
}

export function toResponseTemplateSaveInput(
  form: ResponseTemplateForm,
  shared: boolean,
): SaveResponseTemplateInput {
  return {
    name: form.name,
    kind: form.kind,
    bodyBs: form.bodyBs,
    bodyEn: form.bodyEn.trim().length > 0 ? form.bodyEn : null,
    tags: parseTagsInput(form.tags),
    isActive: form.isActive,
    ...(shared
      ? {
          serviceIds: form.serviceIds,
          categoryIds: form.categoryIds,
          groupIds: form.groupIds,
          reason: form.reason.trim(),
        }
      : {}),
  };
}
