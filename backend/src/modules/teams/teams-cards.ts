import type { TeamsOutboundActivity } from './teams-transport';

/** Paket 3.1: small Adaptive Card 1.5 helpers shared by all builders. */
export type CardElement = Readonly<Record<string, unknown>>;

export function adaptiveCard(body: readonly CardElement[], actions: readonly CardElement[] = []): Record<string, unknown> {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body,
    ...(actions.length > 0 ? { actions } : {}),
  };
}

export function cardActivity(card: Record<string, unknown>, summary?: string): TeamsOutboundActivity {
  return {
    type: 'message',
    ...(summary ? { summary } : {}),
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }],
  };
}

export function textActivity(text: string): TeamsOutboundActivity {
  return { type: 'message', text };
}

export const heading = (text: string): CardElement => ({ type: 'TextBlock', text, weight: 'Bolder', size: 'Medium', wrap: true });
export const paragraph = (text: string, extra: Record<string, unknown> = {}): CardElement => ({ type: 'TextBlock', text, wrap: true, ...extra });
export const openUrl = (title: string, url: string): CardElement => ({ type: 'Action.OpenUrl', title, url });
export const execute = (title: string, verb: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): CardElement => ({
  type: 'Action.Execute',
  title,
  verb,
  data,
  ...extra,
});

/** Adaptive Card text is markdown-like: neutralise user-provided markup. */
export function escapeCardText(value: string): string {
  return value.replace(/([\\*_[\]()#>`~|])/g, '\\$1').replace(/\r?\n/g, ' ');
}
