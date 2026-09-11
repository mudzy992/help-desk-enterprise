import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  mapInstallSeedError,
  type InstallSeedErrorKey,
} from "@/lib/map-install-seed-error";
import {
  loadInstallSeed,
  runInstallSeed,
  type InstallSeedRecord,
} from "@/services/install-seed-api";

export function InstallSeedStep() {
  const { t } = useTranslation();
  const [record, setRecord] = useState<InstallSeedRecord | null>(null);
  const [errorKey, setErrorKey] = useState<InstallSeedErrorKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallSeed()
      .then((status) => {
        if (!isCancelled) {
          setRecord(status.seed);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const onSubmit = async () => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      setRecord(await runInstallSeed());
    } catch (error) {
      setErrorKey(mapInstallSeedError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="mt-6 h-40 animate-pulse bg-elevated" />;
  }

  if (record?.isSeeded === true) {
    return (
      <div className="mt-6 grid max-w-xl gap-3">
        <p className="text-body leading-6 text-muted-foreground">
          {t("install.seed.createdBody")}
        </p>
        <SeedSummary record={record} />
      </div>
    );
  }

  return (
    <div className="mt-6 grid max-w-xl gap-3">
      {errorKey ? (
        <p className="text-body text-destructive">{t(errorKey)}</p>
      ) : null}
      <div>
        <Button type="button" disabled={isSubmitting} onClick={() => void onSubmit()}>
          {isSubmitting ? t("install.seed.saving") : t("install.seed.submit")}
        </Button>
      </div>
    </div>
  );
}

function SeedSummary({ record }: { readonly record: InstallSeedRecord }) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-2 text-body">
      <SummaryRow
        label={t("install.seed.organizationalUnit")}
        value={
          record.organizationalUnit === null
            ? "—"
            : `${record.organizationalUnit.name} (${record.organizationalUnit.ouPath})`
        }
      />
      <SummaryRow
        label={t("install.seed.fallbackGroup")}
        value={record.fallbackGroup?.name ?? "—"}
      />
      <SummaryRow
        label={t("install.seed.service")}
        value={
          record.service === null
            ? "—"
            : `${record.service.name} (${record.service.lifecycle})`
        }
      />
      <SummaryRow
        label={t("install.seed.routing")}
        value={record.resolution?.outcome ?? "—"}
      />
    </dl>
  );
}

function SummaryRow(input: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-metadata text-muted-foreground">{input.label}</dt>
      <dd className="text-foreground">{input.value}</dd>
    </div>
  );
}
