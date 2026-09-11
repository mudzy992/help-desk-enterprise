import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { activateServiceFormVersion } from './activate-service-form-version';
import { bindTicketFormVersionRef } from './bind-ticket-form-version-ref';
import { createServiceForm } from './create-service-form';
import { createServiceFormVersion } from './create-service-form-version';
import { getServiceForm } from './get-service-form';
import { getServiceFormVersion } from './get-service-form-version';
import { mapServiceCatalogError } from './map-service-catalog-error';
import { mapServiceFormsError } from './map-service-forms-error';
import { resolveTicketFormVersion } from './resolve-ticket-form-version';
import { selectActiveFormVersionRef } from './select-active-form-version-ref';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext } from './service-catalog.types';
import { defaultServiceFormsConfiguration } from './service-forms.constants';
import { ServiceFormsConfigurationLoader } from './service-forms-configuration.loader';
import { ServiceFormsError } from './service-forms.error';
import type {
  CreateServiceFormInput,
  CreateServiceFormVersionInput,
  FormVersionResponse,
  ServiceFormResponse,
  TicketFormVersionBinding,
  UpdateServiceFormVersionInput,
} from './service-forms.types';
import { updateServiceFormVersion } from './update-service-form-version';

const emptyContext: CatalogMutationContext = { actorUserId: null };
const defaultConfigurationLoader = {
  load: async () => defaultServiceFormsConfiguration,
} as unknown as ServiceFormsConfigurationLoader;

@Injectable()
export class ServiceFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: ServiceFormsConfigurationLoader = defaultConfigurationLoader,
  ) {}

  createForm(
    serviceId: string,
    input: CreateServiceFormInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<FormVersionResponse> {
    return this.execute(async () =>
      createServiceForm(
        this.prisma,
        serviceId,
        input,
        await this.configurationLoader.load(),
        context,
      ),
    );
  }

  getForm(serviceId: string): Promise<ServiceFormResponse> {
    return this.execute(() => getServiceForm(this.prisma, serviceId));
  }

  createFormVersion(
    serviceId: string,
    input: CreateServiceFormVersionInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<FormVersionResponse> {
    return this.execute(async () =>
      createServiceFormVersion(
        this.prisma,
        serviceId,
        input,
        await this.configurationLoader.load(),
        context,
      ),
    );
  }

  getFormVersion(
    serviceId: string,
    formVersionRef: string,
  ): Promise<FormVersionResponse> {
    return this.execute(() =>
      getServiceFormVersion(this.prisma, serviceId, formVersionRef),
    );
  }

  updateFormVersion(
    serviceId: string,
    formVersionRef: string,
    input: UpdateServiceFormVersionInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<FormVersionResponse> {
    return this.execute(async () =>
      updateServiceFormVersion(
        this.prisma,
        serviceId,
        formVersionRef,
        input,
        await this.configurationLoader.load(),
        context,
      ),
    );
  }

  activateFormVersion(
    serviceId: string,
    formVersionRef: string,
    context: CatalogMutationContext = emptyContext,
  ): Promise<FormVersionResponse> {
    return this.execute(async () =>
      activateServiceFormVersion(
        this.prisma,
        serviceId,
        formVersionRef,
        await this.configurationLoader.load(),
        context,
      ),
    );
  }

  bindTicketFormVersionRef(
    serviceId: string,
    formVersionRef: string | null | undefined,
    context: CatalogMutationContext = emptyContext,
  ): Promise<TicketFormVersionBinding> {
    return this.execute(async () =>
      bindTicketFormVersionRef(
        this.prisma,
        { serviceId, formVersionRef },
        await this.configurationLoader.load(),
        context,
      ),
    );
  }

  resolveTicketFormVersion(ticketId: string): Promise<TicketFormVersionBinding> {
    return this.execute(() => resolveTicketFormVersion(this.prisma, ticketId));
  }

  selectActiveFormVersionRef(serviceId: string): Promise<string> {
    return this.execute(() => selectActiveFormVersionRef(this.prisma, serviceId));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ServiceCatalogError) {
        throw mapServiceCatalogError(error);
      }
      if (error instanceof ServiceFormsError) {
        throw mapServiceFormsError(error);
      }
      throw error;
    }
  }
}
