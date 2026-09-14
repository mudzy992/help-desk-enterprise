import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { DirectorySyncModule } from './modules/directory-sync/directory-sync.module';
import { HealthModule } from './modules/health/health.module';
import { InstallModule } from './modules/install/install.module';
import { OrganizationalUnitsModule } from './modules/organizational-units/organizational-units.module';
import { PolicyPacksModule } from './modules/policy-packs/policy-packs.module';
import { RoutingModule } from './modules/routing/routing.module';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module';
import { ServiceOnboardingModule } from './modules/service-onboarding/service-onboarding.module';
import { SlaModule } from './modules/sla/sla.module';
import { SettingsHttpModule } from './modules/settings/settings-http.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationQueueModule } from './modules/integration-queue/integration-queue.module';
import { ConfigVersioningModule } from './modules/config-versioning/config-versioning.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EdgeExtensionModule } from './modules/edge-extension/edge-extension.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    RedisModule,
    SettingsModule,
    SettingsHttpModule,
    HealthModule,
    InstallModule,
    AuthenticationModule,
    AuthorizationModule,
    DirectorySyncModule,
    OrganizationalUnitsModule,
    PolicyPacksModule,
    RoutingModule,
    ServiceCatalogModule,
    ServiceOnboardingModule,
    SlaModule,
    TicketsModule,
    KnowledgeBaseModule,
    NotificationsModule,
    IntegrationQueueModule,
    ConfigVersioningModule,
    AuditLogModule,
    ObservabilityModule,
    ReportsModule,
    EdgeExtensionModule,
    WebsocketModule,
  ],
})
export class AppModule {}
