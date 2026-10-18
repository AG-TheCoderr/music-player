import { SUPABASE_ANON_KEY, edgeFunctionUrl } from '@/integrations/supabase/config';

/** Error thrown when an edge function call fails. */
export class EdgeFunctionError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.status = status;
  }
}

/** Turns whatever the function returned into a message a user can act on. */
function describeFailure(payload: unknown, status: number): string {
  const record = (typeof payload === 'object' && payload !== null ? payload : null) as Record<string, unknown> | null;
  const detail =
    typeof record?.error === 'string' ? record.error : typeof payload === 'string' ? payload : '';
  const raw = detail || (record ? JSON.stringify(record) : '');

  if (/YT_API_KEY/i.test(raw)) {
    return 'This feature is unavailable: the backend is missing the YT_API_KEY secret.';
  }
  if (/not supported|unsupported/i.test(raw)) {
    return 'This source is not supported by the backend.';
  }
  if (status === 404) {
    return 'The backend function was not found. It may not be deployed yet.';
  }
  if (status === 401 || status === 403) {
    return 'The backend rejected the request. Check the Supabase configuration.';
  }
  if (status >= 500) {
    return 'The backend ran into an error. Please try again.';
  }
  if (detail) {
    return detail;
  }

  return 'The request failed. Please try again.';
}

/**
 * Some functions answer with HTTP 200 but still report `success: false` (for example "this URL is
 * not a direct audio stream"). Without this check such a response is indistinguishable from an
 * empty result and the user only sees "nothing found".
 */
export function assertFunctionSucceeded(payload: unknown): void {
  if (payload && typeof payload === 'object' && (payload as { success?: unknown }).success === false) {
    throw new EdgeFunctionError(describeFailure(payload, 200), 200);
  }
}

/**
 * Calls a Supabase Edge Function.
 *
 * Mirrors `supabase.functions.invoke` without pulling in the SDK.
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: unknown,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(edgeFunctionUrl(name), {
      ...init,
      method: init.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(init.headers ?? {}),
      },
      body: init.body ?? JSON.stringify(body),
    });
  } catch {
    throw new EdgeFunctionError('The backend could not be reached. Check your connection and try again.');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new EdgeFunctionError(describeFailure(payload, response.status), response.status);
  }

  return payload as T;
}
