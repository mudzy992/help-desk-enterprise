import { describe, expect, it } from "vitest";
import {
  buildInstallSmtpInput,
  isInstallSmtpFormReady,
} from "@/lib/build-install-smtp-input";

const completeOn = {
  enabled: true as const,
  host: "smtp.example.com",
  port: "587",
  tls: true,
  username: "helpdesk",
  password: "smtp-secret-value",
  fromAddress: "noreply@example.com",
  passwordAlreadyConfigured: false,
};

describe("buildInstallSmtpInput", () => {
  it("accepts SMTP off without configuration fields", () => {
    const values = {
      ...completeOn,
      enabled: false as const,
      host: "",
      password: "",
    };
    expect(isInstallSmtpFormReady(values)).toBe(true);
    expect(buildInstallSmtpInput(values)).toEqual({ enabled: false });
  });

  it("requires SMTP fields when the switch is on", () => {
    expect(isInstallSmtpFormReady(completeOn)).toBe(true);
    expect(
      isInstallSmtpFormReady({ ...completeOn, host: "" }),
    ).toBe(false);
    expect(
      isInstallSmtpFormReady({ ...completeOn, port: "0" }),
    ).toBe(false);
    expect(
      isInstallSmtpFormReady({ ...completeOn, fromAddress: "not-an-email" }),
    ).toBe(false);
    expect(
      isInstallSmtpFormReady({
        ...completeOn,
        password: "",
        passwordAlreadyConfigured: false,
      }),
    ).toBe(false);
    expect(
      isInstallSmtpFormReady({
        ...completeOn,
        password: "",
        passwordAlreadyConfigured: true,
      }),
    ).toBe(true);
  });

  it("omits an empty password from the SMTP on payload", () => {
    expect(
      buildInstallSmtpInput({
        ...completeOn,
        password: "  ",
        passwordAlreadyConfigured: true,
      }),
    ).toEqual({
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      tls: true,
      username: "helpdesk",
      fromAddress: "noreply@example.com",
    });
  });
});
