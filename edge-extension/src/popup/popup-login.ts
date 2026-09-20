import { t, type UiLanguage } from '../i18n/ui-strings';
import { extensionMessageTypes } from '../lib/extension-messages';
import { helpdeskRequest } from '../lib/helpdesk-http';
import { normalizeApiBaseUrl, readApiBaseUrl } from '../lib/memory-token';
import { mountIcon } from './popup-icons';
import { qs, requireElement, setBusy, setHidden } from './popup-dom';

/**
 * Login view — email/password → `POST /auth/login` → token ide u SW
 * (memorija + chrome.storage.session). Nikad u storage.local.
 */
export function setupLoginView(options: {
  readonly language: UiLanguage;
  readonly onSignedIn: () => void;
  readonly onError: (message: string) => void;
}): { readonly prepare: () => Promise<void> } {
  const form = requireElement<HTMLFormElement>('#login-form');
  const emailInput = requireElement<HTMLInputElement>('#login-email');
  const passwordInput = requireElement<HTMLInputElement>('#login-password');
  const apiUrlInput = requireElement<HTMLInputElement>('#login-api-url');
  const submitButton = requireElement<HTMLButtonElement>('#login-submit');
  const errorElement = requireElement<HTMLElement>('#login-error');
  const advancedToggle = requireElement<HTMLButtonElement>('#login-advanced-toggle');
  const advancedPanel = requireElement<HTMLElement>('#login-advanced');

  applyLoginTexts(options.language);

  advancedToggle.addEventListener('click', () => {
    const willShow = advancedPanel.hasAttribute('hidden');
    setHidden(advancedPanel, !willShow);
    advancedToggle.setAttribute('aria-expanded', String(willShow));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitLogin();
  });

  async function prepare(): Promise<void> {
    errorElement.textContent = '';
    setHidden(errorElement, true);
    const storedUrl = await readApiBaseUrl();
    apiUrlInput.value = storedUrl.length > 0 ? storedUrl : 'http://localhost:10001';
  }

  async function submitLogin(): Promise<void> {
    const apiBaseUrl = normalizeApiBaseUrl(apiUrlInput.value);
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (apiBaseUrl.length === 0 || email.length === 0 || password.length === 0) {
      showLoginError(t('loginFailedFallback', undefined, options.language));
      return;
    }
    setBusy(submitButton, true, t('signingInAction', undefined, options.language));
    try {
      const session = await helpdeskRequest<{ readonly accessToken?: unknown }>({
        apiBaseUrl,
        path: '/auth/login',
        method: 'POST',
        body: { email, password },
      });
      if (typeof session.accessToken !== 'string' || session.accessToken.length === 0) {
        throw new Error('AUTH_RESPONSE');
      }
      await chrome.runtime.sendMessage({
        type: extensionMessageTypes.sessionSet,
        accessToken: session.accessToken,
        apiBaseUrl,
      });
      passwordInput.value = '';
      options.onSignedIn();
    } catch (error) {
      const message =
        error instanceof Error && error.message !== 'AUTH_RESPONSE'
          ? error.message
          : t('loginFailedFallback', undefined, options.language);
      showLoginError(message);
      options.onError(message);
    } finally {
      setBusy(submitButton, false);
    }
  }

  function showLoginError(message: string): void {
    errorElement.textContent = message;
    setHidden(errorElement, false);
  }

  return { prepare };
}

function applyLoginTexts(language: UiLanguage): void {
  const welcomeTitle = qs<HTMLElement>('#login-welcome-title');
  const welcomeSubtitle = qs<HTMLElement>('#login-welcome-subtitle');
  const emailLabel = qs<HTMLElement>('#login-email-label');
  const passwordLabel = qs<HTMLElement>('#login-password-label');
  const apiUrlLabel = qs<HTMLElement>('#login-api-url-label');
  const advancedToggle = qs<HTMLElement>('#login-advanced-toggle');
  const submitLabel = qs<HTMLElement>('#login-submit [data-role="label"]');
  const emailInput = qs<HTMLInputElement>('#login-email');
  const passwordInput = qs<HTMLInputElement>('#login-password');

  if (welcomeTitle !== null) welcomeTitle.textContent = t('welcomeTitle', undefined, language);
  if (welcomeSubtitle !== null) welcomeSubtitle.textContent = t('welcomeSubtitle', undefined, language);
  if (emailLabel !== null) {
    emailLabel.textContent = t('emailLabel', undefined, language);
    mountIcon(emailLabel, 'mail', 14);
  }
  if (passwordLabel !== null) {
    passwordLabel.textContent = t('passwordLabel', undefined, language);
    mountIcon(passwordLabel, 'lock', 14);
  }
  if (apiUrlLabel !== null) {
    apiUrlLabel.textContent = t('apiUrlLabel', undefined, language);
    mountIcon(apiUrlLabel, 'globe', 14);
  }
  if (advancedToggle !== null) advancedToggle.textContent = t('advancedSettings', undefined, language);
  if (submitLabel !== null) submitLabel.textContent = t('signInAction', undefined, language);
  if (emailInput !== null) emailInput.placeholder = t('emailPlaceholder', undefined, language);
  if (passwordInput !== null) passwordInput.placeholder = t('passwordPlaceholder', undefined, language);
}
