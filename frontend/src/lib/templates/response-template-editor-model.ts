import type { ResponseTemplateKind } from "@/services/templates-api";

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
