// Fire-and-forget failure logging into public.ops_events (see migration
// 20260822000005). Callers pass error CODES and short sanitized messages only
// — never note contents, tokens, or user messages.

type SupabaseLikeClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};

export interface OpsEvent {
  source: string;
  code?: string;
  message?: string;
  eventType?: 'error' | 'failure' | 'warning';
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

const MAX_MESSAGE_LENGTH = 300;

export function logOpsEvent(client: SupabaseLikeClient, event: OpsEvent): void {
  try {
    const insert = client.from('ops_events').insert({
      source: event.source,
      event_type: event.eventType ?? 'error',
      code: event.code ?? null,
      message: event.message ? event.message.slice(0, MAX_MESSAGE_LENGTH) : null,
      user_id: event.userId ?? null,
      metadata: event.metadata ?? null,
    });
    // Never let logging failures affect the request path.
    Promise.resolve(insert).then(
      () => {},
      () => {}
    );
  } catch {
    // ignore
  }
}
