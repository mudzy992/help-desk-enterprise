import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";

export function InstallSmtpFields({
  host,
  port,
  tls,
  username,
  password,
  fromAddress,
  passwordConfigured,
  onHostChange,
  onPortChange,
  onTlsChange,
  onUsernameChange,
  onPasswordChange,
  onFromAddressChange,
}: {
  readonly host: string;
  readonly port: string;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
  readonly passwordConfigured: boolean;
  readonly onHostChange: (value: string) => void;
  readonly onPortChange: (value: string) => void;
  readonly onTlsChange: (value: boolean) => void;
  readonly onUsernameChange: (value: string) => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onFromAddressChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label className={labelClassName}>
        {t("install.smtp.host")}
        <input
          className={controlClassName}
          value={host}
          onChange={(event) => onHostChange(event.target.value)}
          autoComplete="off"
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.smtp.port")}
        <input
          className={controlClassName}
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(event) => onPortChange(event.target.value)}
          required
        />
      </label>
      <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <Switch
          checked={tls}
          onCheckedChange={onTlsChange}
          aria-label={t("install.smtp.tls")}
        />
        {t("install.smtp.tls")}
      </label>
      <label className={labelClassName}>
        {t("install.smtp.username")}
        <input
          className={controlClassName}
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          autoComplete="off"
          required
        />
      </label>
      <label className={labelClassName}>
        {t("install.smtp.password")}
        <input
          className={controlClassName}
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          autoComplete="new-password"
        />
      </label>
      {passwordConfigured ? (
        <p className={hintClassName}>
          {t("install.smtp.configured")}
        </p>
      ) : null}
      <label className={labelClassName}>
        {t("install.smtp.fromAddress")}
        <input
          className={controlClassName}
          type="email"
          value={fromAddress}
          onChange={(event) => onFromAddressChange(event.target.value)}
          autoComplete="off"
          required
        />
      </label>
    </>
  );
}
