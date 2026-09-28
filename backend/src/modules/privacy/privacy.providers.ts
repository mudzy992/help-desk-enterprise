import { PrivacyConfigurationLoader } from './privacy-configuration.loader';
import { DataSubjectRequestsService } from './requests/data-subject-requests.service';
import { LegalHoldService } from './legal-hold/legal-hold.service';
import { RetentionService } from './retention/retention.service';
import { TICKET_ATTACHMENT_STORAGE } from '../tickets/attachments/attachment-storage.token';
import { DiskTicketAttachmentStorage } from '../tickets/attachments/disk-ticket-attachment-storage';
import { resolveUploadRoot } from '../tickets/attachments/resolve-upload-root';
import { InboundRawStore } from '../inbound-email/inbound-raw-store';
import { AnonymizationService, INBOUND_RAW_STORE } from './anonymization/anonymization.service';

/** Services shared by the API and the worker (no controllers, no MFA). */
export const privacyCoreProviders = [
  PrivacyConfigurationLoader,
  DataSubjectRequestsService,
  RetentionService,
  LegalHoldService,
  AnonymizationService,
  { provide: INBOUND_RAW_STORE, useFactory: () => new InboundRawStore() },
  {
    provide: TICKET_ATTACHMENT_STORAGE,
    useFactory: () => new DiskTicketAttachmentStorage(resolveUploadRoot()),
  },
];
