import { defaultServiceFormSchema } from "@/lib/services/default-service-form-schema";
import {
  createServiceForm,
  getServiceForm,
  type ServiceFormResponse,
} from "@/services/service-catalog-api";

/// GET /form returns 200 with an empty version list for a new service.
/// The first version must be POST /form, not POST /form/versions.
export async function ensureServiceForm(
  serviceId: string,
  canWrite: boolean,
): Promise<ServiceFormResponse> {
  try {
    const loaded = await getServiceForm(serviceId);
    if (loaded.versions.length > 0 || !canWrite) {
      return loaded;
    }
  } catch (error) {
    if (!canWrite) {
      throw error;
    }
  }
  await createServiceForm(serviceId, defaultServiceFormSchema);
  return getServiceForm(serviceId);
}
