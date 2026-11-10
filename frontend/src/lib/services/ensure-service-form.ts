import { defaultServiceFormSchema } from "@/lib/services/default-service-form-schema";
import { ApiError } from "@/services/api";
import {
  createServiceForm,
  getServiceForm,
  type ServiceFormResponse,
} from "@/services/service-catalog-api";

/**
 * Loads the service form and creates the first version only after a successful
 * empty read. A concurrent creator is treated as success and followed by GET,
 * making retry/reopen safe without hiding unrelated read or create failures.
 */
export async function ensureServiceForm(
  serviceId: string,
  canWrite: boolean,
): Promise<ServiceFormResponse> {
  const loaded = await getServiceForm(serviceId);
  if (loaded.versions.length > 0 || !canWrite) return loaded;
  try {
    await createServiceForm(serviceId, defaultServiceFormSchema);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "FORM_ALREADY_EXISTS") throw error;
  }
  return getServiceForm(serviceId);
}
