import { PrivacyConfigurationLoader } from './privacy-configuration.loader';
import { DataSubjectRequestsService } from './requests/data-subject-requests.service';

/** Services shared by the API and the worker (no controllers, no MFA). */
export const privacyCoreProviders = [PrivacyConfigurationLoader, DataSubjectRequestsService];
