import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createServiceDowntimeWindow } from './create-service-downtime-window';
import { deleteServiceDowntimeWindow } from './delete-service-downtime-window';
import { evaluateServiceTicketCreationEligibility } from './evaluate-service-ticket-creation-eligibility';
import { listServiceDowntimeWindows } from './list-service-downtime-windows';
import { mapServiceCatalogError } from './map-service-catalog-error';
import { ServiceCatalogService } from './service-catalog.service';
import type {
  CreateServiceDowntimeWindowInput,
  DowntimeWindowResponse,
  ServiceTicketCreationEligibility,
  UpdateServiceAvailabilityInput,
  UpdateServiceDowntimeWindowInput,
} from './service-availability.types';
import type {
  CatalogMutationContext,
  ServiceResponse,
} from './service-catalog.types';
import { updateServiceAvailability } from './update-service-availability';
import { updateServiceDowntimeWindow } from './update-service-downtime-window';

const emptyContext: CatalogMutationContext = { actorUserId: null };

@Injectable()
export class ServiceAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  updateAvailability(
    serviceId: string,
    input: UpdateServiceAvailabilityInput,
    context: CatalogMutationContext = emptyContext,
    evaluatedAt: Date = new Date(),
  ): Promise<ServiceResponse> {
    return this.execute(async () => {
      const evaluation = await this.serviceCatalogService.evaluation(evaluatedAt);
      return updateServiceAvailability(
        this.prisma,
        serviceId,
        input,
        evaluation,
        context,
        evaluation,
      );
    });
  }

  listDowntimeWindows(
    serviceId: string,
    evaluatedAt: Date = new Date(),
  ): Promise<readonly DowntimeWindowResponse[]> {
    return this.execute(() =>
      listServiceDowntimeWindows(this.prisma, serviceId, evaluatedAt),
    );
  }

  createDowntimeWindow(
    serviceId: string,
    input: CreateServiceDowntimeWindowInput,
    context: CatalogMutationContext = emptyContext,
    evaluatedAt: Date = new Date(),
  ): Promise<ServiceResponse> {
    return this.execute(async () => {
      const evaluation = await this.serviceCatalogService.evaluation(evaluatedAt);
      return createServiceDowntimeWindow(
        this.prisma,
        serviceId,
        input,
        evaluation,
        context,
        evaluation,
      );
    });
  }

  updateDowntimeWindow(
    serviceId: string,
    downtimeWindowId: string,
    input: UpdateServiceDowntimeWindowInput,
    context: CatalogMutationContext = emptyContext,
    evaluatedAt: Date = new Date(),
  ): Promise<ServiceResponse> {
    return this.execute(async () => {
      const evaluation = await this.serviceCatalogService.evaluation(evaluatedAt);
      return updateServiceDowntimeWindow(
        this.prisma,
        serviceId,
        downtimeWindowId,
        input,
        evaluation,
        context,
        evaluation,
      );
    });
  }

  deleteDowntimeWindow(
    serviceId: string,
    downtimeWindowId: string,
    context: CatalogMutationContext = emptyContext,
    evaluatedAt: Date = new Date(),
    reason?: string,
  ): Promise<ServiceResponse> {
    return this.execute(async () => {
      const evaluation = await this.serviceCatalogService.evaluation(evaluatedAt);
      return deleteServiceDowntimeWindow(
        this.prisma,
        serviceId,
        downtimeWindowId,
        evaluation,
        context,
        evaluation,
        reason,
      );
    });
  }

  evaluateTicketCreationEligibility(
    serviceId: string,
    evaluatedAt: Date = new Date(),
  ): Promise<ServiceTicketCreationEligibility> {
    return this.execute(async () =>
      evaluateServiceTicketCreationEligibility(
        this.prisma,
        serviceId,
        await this.serviceCatalogService.evaluation(evaluatedAt),
      ),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapServiceCatalogError(error);
    }
  }
}
