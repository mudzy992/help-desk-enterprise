import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseDiscoveryService } from './knowledge-base-discovery.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseWorkflowController } from './knowledge-base-workflow.controller';
import { KnowledgeBaseWorkflowService } from './knowledge-base-workflow.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
  ],
  controllers: [KnowledgeBaseController, KnowledgeBaseWorkflowController],
  providers: [
    KnowledgeBaseConfigurationLoader,
    KnowledgeBaseService,
    KnowledgeBaseWorkflowService,
    KnowledgeBaseDiscoveryService,
  ],
  exports: [
    KnowledgeBaseService,
    KnowledgeBaseWorkflowService,
    KnowledgeBaseDiscoveryService,
  ],
})
export class KnowledgeBaseModule {}
