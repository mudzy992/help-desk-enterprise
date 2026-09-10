import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import type { AuthorizationContext } from './authorization.types';
import { createReadOnlyModeForbiddenException } from './create-read-only-mode-forbidden-exception';
import { evaluateAdminReadOnlyAccess } from './evaluate-admin-read-only-access';
import { ReadOnlyModeConfigurationError } from './parse-read-only-mode-configuration';
import type {
  AdminReadOnlyRoute,
  ReadOnlyModeConfiguration,
} from './read-only-mode.types';

export async function enforceAdminReadOnlyMode(input: {
  readonly route: AdminReadOnlyRoute | null;
  readonly principal: AuthorizationPrincipal | null;
  readonly loadConfiguration: () => Promise<ReadOnlyModeConfiguration>;
  readonly loadAuthorizationContext: (
    subjectId: string,
  ) => Promise<AuthorizationContext | null>;
}): Promise<void> {
  if (input.route === null || !input.route.isMutation) {
    return;
  }
  let configuration: ReadOnlyModeConfiguration;
  try {
    configuration = await input.loadConfiguration();
  } catch (error) {
    if (error instanceof ReadOnlyModeConfigurationError) {
      throw createReadOnlyModeForbiddenException();
    }
    throw error;
  }
  const authorizationContext =
    input.principal === null
      ? null
      : await input.loadAuthorizationContext(input.principal.subjectId);
  const decision = evaluateAdminReadOnlyAccess({
    configuration,
    route: input.route,
    authorizationContext,
  });
  if (!decision.allowed) {
    throw createReadOnlyModeForbiddenException();
  }
}
