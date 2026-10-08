import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { useToast } from "@/components/ui/toast";
import { transferProblem } from "@/lib/assets/asset-transfer-view";
import { mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetTransferQueryKeys,
  downloadTransferDocument,
  getTransferConfiguration,
  previewAssetMovement,
  type AssetMovementInput,
  type AssetMovementPreview,
  type AssetMovementResult,
} from "@/services/asset-transfers-api";

export type TransferPreviewState = {
  readonly configuration: { readonly enabled: boolean; readonly required: boolean } | undefined;
  readonly preview: AssetMovementPreview | undefined;
  readonly loading: boolean;
};

/** Transfer switches + a debounced server preview (parties, signatory, problems). */
export function useTransferPreview(active: boolean, input: AssetMovementInput): TransferPreviewState {
  const configurationQuery = useQuery({
    queryKey: assetTransferQueryKeys.configuration,
    queryFn: getTransferConfiguration,
    enabled: active,
    retry: false,
    staleTime: 60_000,
  });
  const serialized = JSON.stringify(input);
  const [debounced, setDebounced] = useState(serialized);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(serialized), 300);
    return () => window.clearTimeout(handle);
  }, [serialized]);
  const previewQuery = useQuery({
    queryKey: [...assetTransferQueryKeys.all, "preview", debounced],
    queryFn: () => previewAssetMovement(JSON.parse(debounced) as AssetMovementInput),
    enabled: active && configurationQuery.data?.enabled === true,
    retry: false,
  });
  return { configuration: configurationQuery.data, preview: previewQuery.data, loading: previewQuery.isFetching };
}

interface AssetTransferSectionProperties {
  readonly preview: TransferPreviewState;
  readonly issueDocument: boolean;
  readonly onIssueDocumentChange: (value: boolean) => void;
}

/** What the record will print; the switch only when records are optional. */
export function AssetTransferSection({ preview, issueDocument, onIssueDocumentChange }: AssetTransferSectionProperties) {
  const { t } = useTranslation();
  const configuration = preview.configuration;
  if (!configuration?.enabled) return null;
  const willIssue = configuration.required || issueDocument;
  const data = preview.preview;
  const problems = (data?.problems ?? []).map(transferProblem).filter((problem) => problem !== null);
  return (
    <section className="grid gap-2 rounded-md border border-border p-3" aria-label={t("assets.transfers.sectionLabel")}>
      {configuration.required ? (
        <p className={hintClassName}>{t("assets.transfers.requiredHint")}</p>
      ) : (
        <Checkbox label={t("assets.transfers.issueDocument")} checked={issueDocument} onChange={(event) => onIssueDocumentChange(event.target.checked)} />
      )}
      {willIssue && data ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-muted-foreground">{t("assets.transfers.from")}</dt>
          <dd className="truncate text-foreground">{data.from.name || "—"}</dd>
          <dt className="text-muted-foreground">{t("assets.transfers.to")}</dt>
          <dd className="truncate text-foreground">{data.to.name || "—"}</dd>
          <dt className="text-muted-foreground">{t("assets.transfers.signatory")}</dt>
          <dd className="truncate text-foreground">
            {data.signatory.name || t("assets.transfers.noSignatory")}
            {data.signatory.title ? <span className="text-muted-foreground"> · {data.signatory.title}</span> : null}
          </dd>
        </dl>
      ) : null}
      {willIssue && preview.loading && !data ? <p className={hintClassName}>{t("ui.loading")}</p> : null}
      {problems.length > 0 ? (
        <ul className={`grid gap-0.5 ${errorTextClassName}`}>
          {problems.map((problem, index) => (
            <li key={index}>{t(problem.key, { assetTag: problem.assetTag })}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Success state after a move that issued a record: download right away. */
export function AssetTransferIssued({ result, onClose }: { readonly result: AssetMovementResult; readonly onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  async function download() {
    if (!result.transferId || !result.number) return;
    setPending(true);
    try {
      await downloadTransferDocument(result.transferId, result.number);
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.transfers.downloadFailed"), description: t(mapAssetError(caught) ?? mapApiError(caught)), error: caught });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-4 grid gap-3" role="status">
      <p className="flex items-center gap-2 text-[13px] text-foreground">
        <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
        {t("assets.transfers.issued", { number: result.number })}
      </p>
      <p className={hintClassName}>{t("assets.transfers.issuedHint")}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("assets.transfers.close")}
        </Button>
        <Button type="button" variant="primary" onClick={() => void download()} disabled={pending}>
          <FileDown size={14} aria-hidden="true" />
          {pending ? t("ui.loading") : t("assets.transfers.downloadDocx")}
        </Button>
      </div>
    </div>
  );
}
