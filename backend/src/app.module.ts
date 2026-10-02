import { AdminRealtimeModule } from './common/admin-realtime/admin-realtime.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { DirectorySyncModule } from './modules/directory-sync/directory-sync.module';
import { InboundEmailAdminModule } from './modules/inbound-email/inbound-email-admin.module';
import { GroupsModule } from './modules/groups/groups.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';
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
import { TemplatesModule } from './modules/templates/templates.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { SearchModule } from './modules/search/search.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationQueueModule } from './modules/integration-queue/integration-queue.module';
import { ConfigVersioningModule } from './modules/config-versioning/config-versioning.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { OpsHealthModule } from './modules/ops-health/ops-health.module';
import { StatusPageModule } from './modules/status-page/status-page.module';
import { OnCallModule } from './modules/on-call/on-call.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { ChangesModule } from './modules/changes/changes.module';
import { TeamsModule } from './modules/teams/teams.module';
import { EdgeExtensionModule } from './modules/edge-extension/edge-extension.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AdminRealtimeModule,
    RedisModule,
    SettingsModule,
    SettingsHttpModule,
    HealthModule,
    InstallModule,
    AuthenticationModule,
    AuthorizationModule,
    DirectorySyncModule,
    InboundEmailAdminModule,
    OrganizationalUnitsModule,
    GroupsModule,
    RbacModule,
    UsersModule,
    PolicyPacksModule,
    RoutingModule,
    ServiceCatalogModule,
    ServiceOnboardingModule,
    SlaModule,
    TicketsModule,
    TemplatesModule,
    KnowledgeBaseModule,
    SearchModule,
    NotificationsModule,
    IntegrationQueueModule,
    ConfigVersioningModule,
    AuditLogModule,
    ObservabilityModule,
    ReportsModule,
    PrivacyModule,
    OpsHealthModule,
    StatusPageModule,
    OnCallModule,
    AnnouncementsModule,
    AssetsModule,
    ProblemsModule,
    ChangesModule,
    TeamsModule,
    EdgeExtensionModule,
    WebsocketModule,
  ],
})
export class AppModule {}
