import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createService } from './create-service';
import { createServiceCategory } from './create-service-category';
import { deleteService } from './delete-service';
import { deleteServiceCategory } from './delete-service-category';
import { getService } from './get-service';
import { getServiceCategory } from './get-service-category';
import { listServiceCategories } from './list-service-categories';
import { listServices } from './list-services';
import { mapServiceCatalogError } from './map-service-catalog-error';
import { ServiceLifecycleConfigurationLoader } from './service-lifecycle-configuration.loader';
import type {
  CatalogMutationContext,
  CreateServiceCategoryInput,
  CreateServiceInput,
  ListServicesInput,
  ServiceCategoryResponse,
  ServiceResponse,
  TransitionServiceLifecycleInput,
  UpdateServiceCategoryInput,
  UpdateServiceInput,
} from './service-catalog.types';
import { transitionServiceLifecycle } from './transition-service-lifecycle';
import { updateService } from './update-service';
import { updateServiceCategory } from './update-service-category';

const emptyContext: CatalogMutationContext = { actorUserId: null };

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleConfigurationLoader: ServiceLifecycleConfigurationLoader,
  ) {}

  createCategory(
    input: CreateServiceCategoryInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceCategoryResponse> {
    return this.execute(() => createServiceCategory(this.prisma, input, context));
  }

  listCategories(): Promise<readonly ServiceCategoryResponse[]> {
    return this.execute(() => listServiceCategories(this.prisma));
  }

  getCategory(serviceCategoryId: string): Promise<ServiceCategoryResponse> {
    return this.execute(() => getServiceCategory(this.prisma, serviceCategoryId));
  }

  updateCategory(
    serviceCategoryId: string,
    input: UpdateServiceCategoryInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceCategoryResponse> {
    return this.execute(() =>
      updateServiceCategory(this.prisma, serviceCategoryId, input, context),
    );
  }

  deleteCategory(
    serviceCategoryId: string,
    context: CatalogMutationContext = emptyContext,
  ): Promise<void> {
    return this.execute(() =>
      deleteServiceCategory(this.prisma, serviceCategoryId, context),
    );
  }

  async create(
    input: CreateServiceInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceResponse> {
    return this.execute(async () => {
      const configuration = await this.lifecycleConfigurationLoader.load();
      return createService(this.prisma, input, configuration, context);
    });
  }

  list(input: ListServicesInput = {}): Promise<readonly ServiceResponse[]> {
    return this.execute(() => listServices(this.prisma, input));
  }

  getById(serviceId: string): Promise<ServiceResponse> {
    return this.execute(() => getService(this.prisma, serviceId));
  }

  update(
    serviceId: string,
    input: UpdateServiceInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceResponse> {
    return this.execute(() => updateService(this.prisma, serviceId, input, context));
  }

  async transitionLifecycle(
    serviceId: string,
    input: TransitionServiceLifecycleInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceResponse> {
    return this.execute(async () => {
      const configuration = await this.lifecycleConfigurationLoader.load();
      return transitionServiceLifecycle(
        this.prisma,
        serviceId,
        input,
        configuration,
        context,
      );
    });
  }

  delete(
    serviceId: string,
    context: CatalogMutationContext = emptyContext,
  ): Promise<void> {
    return this.execute(() => deleteService(this.prisma, serviceId, context));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapServiceCatalogError(error);
    }
  }
}
