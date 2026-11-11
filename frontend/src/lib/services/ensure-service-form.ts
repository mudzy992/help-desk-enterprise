import { getServiceForm, type ServiceFormResponse } from "@/services/service-catalog-api";

/**
 * Loads the current form without creating it as a read side effect. The first
 * version is created only from the explicit form-builder action, where the
 * human caller supplies the change-log reason.
 */
export function ensureServiceForm(serviceId: string): Promise<ServiceFormResponse> {
  return getServiceForm(serviceId);
}
