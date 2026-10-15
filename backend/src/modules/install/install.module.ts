import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountSecurityPolicyLoader } from '../authentication/security/account-security-policy.loader';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { RoutingModule } from '../routing/routing.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { InstallAddonsService } from './install-addons.service';
import { InstallBlueprintController } from './install-blueprint.controller';
import { InstallBlueprintService } from './blueprints/install-blueprint.service';
import { InstallContentController } from './install-content.controller';
import { InstallPolicyPackService } from './install-policy-pack.service';
import { InstallSlaReviewService } from './install-sla-review.service';
import { InstallSmtpTestController } from './install-smtp-test.controller';
import { InstallSmtpTestService } from './install-smtp-test.service';
import { InstallCompleteService } from './install-complete.service';
import { InstallController } from './install.controller';
import { InstallStepsController } from './install-steps.controller';
import { InstallIdentityService } from './install-identity.service';
import { InstallLoginProviderService } from './install-login-provider.service';
import { InstallProfileService } from './install-profile.service';
import { InstallReadinessService } from './install-readiness.service';
import { InstallSeedService } from './install-seed.service';
import { InstallSetupGuard } from './install-setup.guard';
import { InstallSetupService } from './install-setup.service';
import { InstallSmtpService } from './install-smtp.service';
import { InstallStepSkipService } from './install-step-skip.service';
import { InstallTeamService } from './install-team.service';
import { InstallSuperAdminService } from './install-super-admin.service';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';

@Module({
  imports: [SettingsModule, ServiceCatalogModule, RoutingModule],
  controllers: [
    InstallController,
    InstallStepsController,
    InstallBlueprintController,
    InstallContentController,
    InstallSmtpTestController,
  ],
  providers: [
    // Paket 5.1 (M1 #1): password policy for the founder account. The loader
    // only needs SettingsService, which SettingsModule already exports — an
    // import of AuthenticationModule is deliberately avoided (module cycles).
    AccountSecurityPolicyLoader,
    // F2: the team step creates accounts through the users domain, which needs a
    // mail transport. Provided here instead of importing NotificationsModule:
    // that module pulls in Tickets/Authentication and would close a cycle back
    // into the install guard (same reasoning as the loader above).
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    InstallSetupService,
    InstallSuperAdminService,
    InstallIdentityService,
    InstallTeamService,
    InstallLoginProviderService,
    InstallSmtpService,
    InstallSeedService,
    {
      provide: InstallAddonsService,
      useFactory: (
        prisma: PrismaService,
        settingsService: SettingsService,
        installSetupService: InstallSetupService,
      ) => new InstallAddonsService(prisma, settingsService, installSetupService),
      inject: [PrismaService, SettingsService, InstallSetupService],
    },
    InstallBlueprintService,
    InstallPolicyPackService,
    InstallSlaReviewService,
    InstallSmtpTestService,
    InstallProfileService,
    InstallStepSkipService,
    InstallReadinessService,
    InstallCompleteService,
    InstallSetupGuard,
    InstallWizardLockGuard,
    {
      provide: APP_GUARD,
      useExisting: InstallSetupGuard,
    },
  ],
  exports: [InstallSetupService],
})
export class InstallModule {}
