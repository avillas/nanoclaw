// ============================================================================
// NanoClaw Mission Control — Resilient client-side fetch helper
// ----------------------------------------------------------------------------
// On mobile networks the dashboard was suffering from three issues that all
// looked like "no data":
//
//   1. fetch() calls had no timeout — slow requests would hang forever
//   2. fetch() calls had no error handling — failures silently overwrote good
//      state with empty defaults (e.g. setAgents([]) when the request 500'd)
//   3. responses were cached aggressively by some mobile browsers because the
//      API never set Cache-Control headers
//
// fetchJson() addresses all three: it forces no-store, attaches an
// AbortController with a sane timeout, and returns null on any failure so the
// caller can decide whether to keep the previous state or surface an error.
// ============================================================================

const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchJsonOptions extends Omit<RequestInit, 'signal'> {
  /** Abort the request after this many milliseconds. Default 10s. */
  timeoutMs?: number;
}

/**
 * Fetch a URL and parse the response as JSON.
 *
 * Returns the parsed body on success or `null` on any failure (network error,
 * abort/timeout, non-2xx status, JSON parse error). Errors are logged to the
 * browser console for debugging but are intentionally not thrown — callers
 * should branch on `null` and decide whether to keep their previous state.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      ...rest,
    });

    if (!res.ok) {
      // 4xx/5xx — log and bail without trying to parse a possibly-HTML body.
      console.warn(`[fetchJson] ${url} returned HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.warn(`[fetchJson] ${url} timed out after ${timeoutMs}ms`);
    } else {
      console.warn(`[fetchJson] ${url} failed:`, err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convenience helper for the common pattern of:
 *
 *   const data = await fetchJson<T>(url);
 *   if (data !== null) setState(data);
 *
 * On failure the previous state is preserved instead of being clobbered with
 * an empty default. Use this for periodic refetches where you want to keep
 * showing the last known good data through transient network blips.
 */
export async function refreshState<T>(
  url: string,
  setter: (value: T) => void,
  options?: FetchJsonOptions,
): Promise<T | null> {
  const data = await fetchJson<T>(url, options);
  if (data !== null) {
    setter(data);
  }
  return data;
}
