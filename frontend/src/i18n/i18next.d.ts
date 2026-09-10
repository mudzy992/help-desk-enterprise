import "i18next";
import type bosnianCommon from "./locales/bs/common.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    returnNull: false;
    resources: {
      common: typeof bosnianCommon;
    };
  }
}
