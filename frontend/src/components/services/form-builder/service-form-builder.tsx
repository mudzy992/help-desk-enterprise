import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormBuilderActions } from "@/components/services/form-builder/form-builder-actions";
import { FormFieldList } from "@/components/services/form-builder/form-field-list";
import { FormVersionHistory } from "@/components/services/form-builder/form-version-history";
import { errorTextClassName } from "@/components/ui/control";
import { defaultServiceFormSchema } from "@/lib/services/default-service-form-schema";
import { orderedFormSchema } from "@/lib/services/form-field-draft";
import {
  mapServiceFormsError,
  type ServiceFormsErrorKey,
} from "@/lib/services/map-service-forms-error";
import {
  activateServiceFormVersion,
  createServiceForm,
  getServiceForm,
  type FormVersionResponse,
  type ServiceFormField,
  type ServiceFormResponse,
} from "@/services/service-catalog-api";
import {
  createServiceFormVersion,
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
  const [form, setForm] = useState<ServiceFormResponse | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [fields, setFields] = useState<ServiceFormField[]>([]);
  const [errorKey, setErrorKey] = useState<ServiceFormsErrorKey | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const selected =
    form?.versions.find((item) => item.formVersionRef === selectedRef) ?? null;
  const editable =
    canWrite && selected?.status === "DRAFT" && selected.isImmutable !== true;

  const applyForm = (loaded: ServiceFormResponse, preferredRef?: string) => {
    const nextRef =
      preferredRef ??
      loaded.versions.find((item) => item.status === "DRAFT")?.formVersionRef ??
      loaded.activeFormVersionRef ??
      loaded.versions[0]?.formVersionRef ??
      null;
    const version = loaded.versions.find((item) => item.formVersionRef === nextRef);
    setForm(loaded);
    setSelectedRef(nextRef);
    setFields(version ? [...version.schema.fields] : []);
    onActiveVersion(loaded.activeFormVersionRef);
  };

  const reload = async (preferredRef?: string) => {
    applyForm(await getServiceForm(serviceId), preferredRef);
  };

  useEffect(() => {
    let cancelled = false;
    void getServiceForm(serviceId)
      .then((loaded) => {
        if (!cancelled) {
          applyForm(loaded);
        }
      })
      .catch(async (error: unknown) => {
        if (cancelled || !canWrite) {
          setErrorKey(mapServiceFormsError(error));
          return;
        }
        try {
          await createServiceForm(serviceId, defaultServiceFormSchema);
          if (!cancelled) {
            applyForm(await getServiceForm(serviceId));
          }
        } catch (createError) {
          if (!cancelled) {
            setErrorKey(mapServiceFormsError(createError));
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canWrite, serviceId]);

  const run = async (key: string, work: () => Promise<FormVersionResponse>) => {
    setPending(key);
    setErrorKey(null);
    try {
      const result = await work();
      await reload(result.formVersionRef);
    } catch (error) {
      setErrorKey(mapServiceFormsError(error));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <FormVersionHistory
        versions={form?.versions ?? []}
        selectedRef={selectedRef}
        onSelect={(formVersionRef) => {
          setSelectedRef(formVersionRef);
          const version = form?.versions.find(
            (item) => item.formVersionRef === formVersionRef,
          );
          setFields(version ? [...version.schema.fields] : []);
        }}
      />
      <div className="grid gap-3">
        {selected && !editable ? (
          <p className="text-[12px] text-muted-foreground">{t("services.forms.immutableHint")}</p>
        ) : null}
        <FormFieldList fields={fields} editable={Boolean(editable)} onChange={setFields} />
        {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
        <FormBuilderActions
          editable={Boolean(editable)}
          canWrite={canWrite}
          selected={selected}
          hasFields={fields.length > 0}
          pending={pending}
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
                createServiceFormVersion(
                  serviceId,
                  orderedFormSchema(selected.schema.fields),
                ),
              );
            }
          }}
        />
      </div>
    </div>
  );
}
