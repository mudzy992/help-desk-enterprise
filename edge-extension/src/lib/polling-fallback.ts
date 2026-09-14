import { helpdeskRequest } from './helpdesk-http';

type NotificationListResponse = {
  readonly items: readonly {
    readonly id: string;
    readonly type: string;
    readonly ticketId: string | null;
  }[];
};

export async function fetchUnreadNotifications(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<NotificationListResponse['items']> {
  const response = await helpdeskRequest<NotificationListResponse>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/notifications?unreadOnly=true',
  });
  return response.items;
}

export function startUnreadPolling(input: {
  readonly intervalSeconds: number;
  readonly tick: () => void;
}): () => void {
  const intervalMs = input.intervalSeconds * 1000;
  const timer = setInterval(() => {
    input.tick();
  }, intervalMs);
  input.tick();
  return () => {
    clearInterval(timer);
  };
}
