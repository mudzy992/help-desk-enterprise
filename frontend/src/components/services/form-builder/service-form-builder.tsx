import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormBuilderActions } from "@/components/services/form-builder/form-builder-actions";
import { FormFieldList } from "@/components/services/form-builder/form-field-list";
import { FormVersionHistory } from "@/components/services/form-builder/form-version-history";
import { errorTextClassName } from "@/components/ui/control";
import { useOperationGuard } from "@/lib/async/use-operation-guard";
import { defaultServiceFormSchema } from "@/lib/services/default-service-form-schema";
import { ensureServiceForm } from "@/lib/services/ensure-service-form";
import { isValidFormFieldDraft, orderedFormSchema } from "@/lib/services/form-field-draft";
import {
  mapServiceFormsError,
  type ServiceFormsErrorKey,
} from "@/lib/services/map-service-forms-error";
import {
  activateServiceFormVersion,
  createServiceForm,
  getServiceForm,
  serviceFormVersionsClientMaximumPages,
  type FormVersionResponse,
  type ServiceFormField,
  type ServiceFormResponse,
} from "@/services/service-catalog-api";
import {
  createServiceFormVersion,
  getServiceFormVersion,
  updateServiceFormVersion,
} from "@/services/service-forms-api";

interface ServiceFormBuilderProperties {
  readonly serviceId: string;
  readonly canWrite: boolean;
  readonly onActiveVersion: (formVersionRef: string | null) => void;
}

export function ServiceFormBuilder({
  serviceId,
  canWrite,
  onActiveVersion,
}: ServiceFormBuilderProperties) {
  const { t } = useTranslation();
  const operationGuard = useOperationGuard();
  const serviceIdentity = useRef(serviceId);
  serviceIdentity.current = serviceId;
  const [form, setForm] = useState<ServiceFormResponse | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [fields, setFields] = useState<ServiceFormField[]>([]);
  const [errorKey, setErrorKey] = useState<ServiceFormsErrorKey | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedHistoryPages, setLoadedHistoryPages] = useState(1);
  const selected = form?.versions.find((item) => item.formVersionRef === selectedRef) ?? null;
  const editable = canWrite && selected?.status === "DRAFT" && selected.isImmutable !== true;
  const validDraft = isValidFormFieldDraft(fields);

  const applyForm = useCallback((loaded: ServiceFormResponse, preferredRef?: string) => {
    const versions =
      loaded.activeForm !== null &&
      !loaded.versions.some((item) => item.formVersionRef === loaded.activeForm?.formVersionRef)
        ? [...loaded.versions, loaded.activeForm]
        : loaded.versions;
    const normalized = { ...loaded, versions };
    const preferred = normalized.versions.find((item) => item.formVersionRef === preferredRef);
    const nextRef =
      preferred?.formVersionRef ??
      normalized.versions.find((item) => item.status === "DRAFT")?.formVersionRef ??
      normalized.versions.find((item) => item.formVersionRef === normalized.activeFormVersionRef)
        ?.formVersionRef ??
      normalized.versions[0]?.formVersionRef ??
      null;
    const version = normalized.versions.find((item) => item.formVersionRef === nextRef);
    setForm(normalized);
    setLoadedHistoryPages(1);
    setSelectedRef(nextRef);
    setFields(version ? [...version.schema.fields] : []);
  }, []);

  const reload = async (preferredRef?: string) => {
    const requestedServiceId = serviceId;
    let loaded = await getServiceForm(requestedServiceId);
    if (serviceIdentity.current !== requestedServiceId) return null;
    if (
      preferredRef &&
      !loaded.versions.some((item) => item.formVersionRef === preferredRef) &&
      loaded.activeForm?.formVersionRef !== preferredRef
    ) {
      const preferred = await getServiceFormVersion(requestedServiceId, preferredRef);
      if (serviceIdentity.current !== requestedServiceId) return null;
      loaded = { ...loaded, versions: [...loaded.versions, preferred] };
    }
    applyForm(loaded, preferredRef);
    return loaded;
  };

  const loadMoreVersions = async () => {
    if (
      form === null ||
      !form.hasMore ||
      form.nextCursor === null ||
      loadingMore ||
      loadedHistoryPages >= serviceFormVersionsClientMaximumPages
    )
      return;
    const requestedServiceId = serviceId;
    setLoadingMore(true);
    setErrorKey(null);
    try {
      const page = await getServiceForm(requestedServiceId, {
        take: form.take,
        cursor: form.nextCursor,
      });
      if (serviceIdentity.current !== requestedServiceId) return;
      setLoadedHistoryPages((current) => current + 1);
      setForm((current) => {
        if (current === null || current.serviceId !== requestedServiceId) return current;
        const existingRefs = new Set(current.versions.map((item) => item.formVersionRef));
        return {
          ...current,
          versions: [
            ...current.versions,
            ...page.versions.filter((item) => !existingRefs.has(item.formVersionRef)),
          ],
          total: page.total,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        };
      });
    } catch (error) {
      setErrorKey(mapServiceFormsError(error));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void ensureServiceForm(serviceId, canWrite)
      .then((loaded) => {
        if (!cancelled) {
          applyForm(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorKey(mapServiceFormsError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyForm, canWrite, serviceId]);

  const run = async (key: string, work: () => Promise<FormVersionResponse>) => {
    const operationKey = `${serviceId}:${key}`;
    await operationGuard.run(operationKey, async () => {
      setPending(key);
      setErrorKey(null);
      try {
        const previousActiveRef = form?.activeFormVersionRef ?? null;
        const result = await work();
        const loaded = await reload(result.formVersionRef);
        if (loaded !== null && loaded.activeFormVersionRef !== previousActiveRef) {
          onActiveVersion(loaded.activeFormVersionRef);
        }
      } catch (error) {
        setErrorKey(mapServiceFormsError(error));
      } finally {
        setPending(null);
      }
    });
  };

  return (
    <div className="fade-in grid gap-4 lg:grid-cols-[200px_1fr]">
      <FormVersionHistory
        versions={form?.versions ?? []}
        selectedRef={selectedRef}
        hasMore={Boolean(
          form?.hasMore && loadedHistoryPages < serviceFormVersionsClientMaximumPages,
        )}
        limitReached={Boolean(
          form?.hasMore && loadedHistoryPages >= serviceFormVersionsClientMaximumPages,
        )}
        isLoadingMore={loadingMore}
        onLoadMore={() => void loadMoreVersions()}
        onSelect={(formVersionRef) => {
          setSelectedRef(formVersionRef);
          const version = form?.versions.find((item) => item.formVersionRef === formVersionRef);
          setFields(version ? [...version.schema.fields] : []);
        }}
      />
      <div className="grid gap-3">
        {selected && !editable ? (
          <p className="text-[12px] text-muted-foreground">{t("services.forms.immutableHint")}</p>
        ) : null}
        <FormFieldList fields={fields} editable={Boolean(editable)} onChange={setFields} />
        {editable && fields.length > 0 && !validDraft ? (
          <p className={errorTextClassName}>{t("services.forms.draftInvalid")}</p>
        ) : null}
        {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
        <FormBuilderActions
          editable={Boolean(editable)}
          canWrite={canWrite}
          selected={selected}
          hasVersions={(form?.total ?? 0) > 0}
          hasFields={validDraft}
          pending={pending}
          onCreateFirst={() => {
            void run("create", () => createServiceForm(serviceId, defaultServiceFormSchema));
          }}
          onSave={() => {
            if (selected) {
              void run("save", () =>
                updateServiceFormVersion(
                  serviceId,
                  selected.formVersionRef,
                  orderedFormSchema(fields),
                ),
              );
            }
          }}
          onActivate={() => {
            if (selected) {
              void run("activate", () =>
                activateServiceFormVersion(serviceId, selected.formVersionRef),
              );
            }
          }}
          onCopy={() => {
            if (selected) {
              void run("copy", () =>
                createServiceFormVersion(serviceId, orderedFormSchema(selected.schema.fields)),
              );
            }
          }}
        />
      </div>
    </div>
  );
}
