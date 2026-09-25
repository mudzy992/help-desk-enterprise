import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PlaybooksController } from './playbooks/playbooks.controller';
import { PlaybooksService } from './playbooks/playbooks.service';
import {
  ResponseTemplatesController,
  TicketResponseTemplatesController,
} from './response-templates.controller';
import { ResponseTemplatesService } from './response-templates.service';
import { TemplatesConfigurationLoader } from './templates-configuration.loader';
import { TicketPlaybooksController } from './ticket-playbooks/ticket-playbooks.controller';
import { TicketPlaybooksService } from './ticket-playbooks/ticket-playbooks.service';

/** Package 1.4 — response templates and playbooks. */
@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule, TicketsModule],
  controllers: [
    ResponseTemplatesController,
    TicketResponseTemplatesController,
    PlaybooksController,
    TicketPlaybooksController,
  ],
  providers: [
    TemplatesConfigurationLoader,
    ResponseTemplatesService,
    PlaybooksService,
    TicketPlaybooksService,
  ],
})
export class TemplatesModule {}
