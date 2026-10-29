import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { assetErrorDetail, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";

export function useAssetCatalogErrorText() {
  const { t } = useTranslation();
  return (caught: unknown) => {
    const detail = assetErrorDetail(caught);
    const message = t(mapAssetError(caught) ?? mapApiError(caught));
    return detail ? `${message} (${detail})` : message;
  };
}

export function EditorFooter({
  pending,
  disabled,
  onCancel,
}: {
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t("ui.cancel")}
      </Button>
      <Button type="submit" variant="primary" disabled={pending || disabled}>
        {pending ? t("ui.loading") : t("assets.form.save")}
      </Button>
    </div>
  );
}
