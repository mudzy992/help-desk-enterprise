import { Injectable, Optional } from "@nestjs/common";
import {
  OptimisticConcurrencyService,
  parseIfMatch,
} from "../../common/optimistic-concurrency/optimistic-concurrency.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { mapRoutingError } from "../routing/map-routing-error";
import { RoutingError } from "../routing/routing.error";
import { RoutingService } from "../routing/routing.service";
import { createService } from "./create-service";
import { createServiceCategory } from "./create-service-category";
import { deleteService } from "./delete-service";
import { deleteServiceCategory } from "./delete-service-category";
import { getService } from "./get-service";
import { getServiceCategory } from "./get-service-category";
import { listServiceCategories } from "./list-service-categories";
import { listServices } from "./list-services";
import { mapServiceCatalogError } from "./map-service-catalog-error";
import { defaultServiceAvailabilityConfigurationBundle } from "./service-availability.constants";
import { ServiceAvailabilityConfigurationLoader } from "./service-availability-configuration.loader";
import type {
  ServiceAvailabilityConfigurationBundle,
  ServiceAvailabilityEvaluationContext,
} from "./service-availability.types";
import { ServiceLifecycleConfigurationLoader } from "./service-lifecycle-configuration.loader";
import { defaultTicketApprovalsConfiguration } from "../tickets/approvals/approvals.constants";
import { TicketApprovalsConfigurationLoader } from "../tickets/approvals/ticket-approvals-configuration.loader";
import type { TicketApprovalsConfiguration } from "../tickets/approvals/approvals.types";
import type {
  CatalogMutationContext,
  CreateServiceCategoryInput,
  ServiceCategoryListInput,
  ServiceCategoryListPage,
  CreateServiceInput,
  ListServicesInput,
  ServiceCategoryResponse,
  ServiceListPage,
  ServiceResponse,
  TransitionServiceLifecycleInput,
  UpdateServiceCategoryInput,
  UpdateServiceInput,
} from "./service-catalog.types";
import { transitionServiceLifecycle } from "./transition-service-lifecycle";
import { updateService } from "./update-service";
import { updateServiceCategory } from "./update-service-category";

const emptyContext: CatalogMutationContext = { actorUserId: null };
const defaultAvailabilityConfigurationLoader = {
  load: async (): Promise<ServiceAvailabilityConfigurationBundle> =>
    defaultServiceAvailabilityConfigurationBundle,
} as unknown as ServiceAvailabilityConfigurationLoader;

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleConfigurationLoader: ServiceLifecycleConfigurationLoader,
    private readonly availabilityConfigurationLoader: ServiceAvailabilityConfigurationLoader = defaultAvailabilityConfigurationLoader,
    @Optional() private readonly routingService: RoutingService | null = null,
    // Optional so existing tests that construct this service directly keep
    // working; without it, approvalSteps falls back to the service's own
    // requiresApproval flag (no configured overlay).
    @Optional()
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader | null = null,
    @Optional()
    private readonly optimisticConcurrency: OptimisticConcurrencyService = new OptimisticConcurrencyService(),
  ) {}

  private async approvalsConfiguration(): Promise<TicketApprovalsConfiguration> {
    return this.approvalsConfigurationLoader === null
      ? defaultTicketApprovalsConfiguration
      : this.approvalsConfigurationLoader.load();
  }

  createCategory(
    input: CreateServiceCategoryInput,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceCategoryResponse> {
    return this.execute(() =>
      createServiceCategory(this.prisma, input, context),
    );
  }

  listCategories(
    input: ServiceCategoryListInput = {},
  ): Promise<ServiceCategoryListPage> {
    return this.execute(() => listServiceCategories(this.prisma, input));
  }

  getCategory(serviceCategoryId: string): Promise<ServiceCategoryResponse> {
    return this.execute(() =>
      getServiceCategory(this.prisma, serviceCategoryId),
    );
  }

  updateCategory(
    serviceCategoryId: string,
    input: UpdateServiceCategoryInput,
    ifMatch: string | string[] | undefined,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceCategoryResponse> {
    return this.execute(() =>
      updateServiceCategory(
        this.prisma,
        serviceCategoryId,
        input,
        ifMatch,
        context,
        this.optimisticConcurrency,
      ),
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

  list(
    input: ListServicesInput = {},
    evaluatedAt: Date = new Date(),
  ): Promise<ServiceListPage> {
    return this.execute(async () =>
      listServices(
        this.prisma,
        input,
        await this.evaluation(evaluatedAt),
        await this.approvalsConfiguration(),
      ),
    );
  }

  getById(
    serviceId: string,
    evaluatedAt: Date = new Date(),
    /** Val 2 (M6/B2): role pozivaoca; `undefined` = interni poziv bez filtera. */
    roleKeys?: readonly string[],
  ): Promise<ServiceResponse> {
    return this.execute(async () =>
      getService(
        this.prisma,
        serviceId,
        await this.evaluation(evaluatedAt),
        await this.approvalsConfiguration(),
        roleKeys,
      ),
    );
  }

  update(
    serviceId: string,
    input: UpdateServiceInput,
    ifMatch: string | string[] | undefined,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceResponse> {
    return this.execute(() =>
      updateService(
        this.prisma,
        serviceId,
        input,
        ifMatch,
        context,
        this.optimisticConcurrency,
      ),
    );
  }

  async transitionLifecycle(
    serviceId: string,
    input: TransitionServiceLifecycleInput,
    ifMatch: string | string[] | undefined,
    context: CatalogMutationContext = emptyContext,
  ): Promise<ServiceResponse> {
    parseIfMatch(ifMatch);
    return this.execute(async () => {
      const configuration = await this.lifecycleConfigurationLoader.load();
      const coverageEvaluation =
        input.lifecycle === "ACTIVE" && this.routingService !== null
          ? await this.routingService.evaluateActivationCoverage(serviceId)
          : null;
      return transitionServiceLifecycle(
        this.prisma,
        serviceId,
        input,
        ifMatch,
        configuration,
        context,
        this.optimisticConcurrency,
        coverageEvaluation,
      );
    });
  }

  delete(
    serviceId: string,
    context: CatalogMutationContext = emptyContext,
  ): Promise<void> {
    return this.execute(() => deleteService(this.prisma, serviceId, context));
  }

  async evaluation(now: Date): Promise<ServiceAvailabilityEvaluationContext> {
    const bundle = await this.availabilityConfigurationLoader.load();
    return { now, ...bundle };
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof RoutingError) {
        throw mapRoutingError(error);
      }
      throw mapServiceCatalogError(error);
    }
  }
}
