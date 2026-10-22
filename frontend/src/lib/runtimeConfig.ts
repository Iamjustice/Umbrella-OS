/**
 * Browser-side URLs for API / WS / stream (ws-scrcpy or noVNC).
 * On a non-localhost host we use same-origin paths (Caddy reverse proxy).
 * Locally we keep the split ports used by docker-compose.yml.
 */

function isRemoteBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

export function getApiUrl(): string {
  if (isRemoteBrowser()) return `${window.location.origin}/api`;
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
}

export function getWsUrl(): string {
  if (isRemoteBrowser()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
}

/**
 * ws-scrcpy deep link used by the Graviton / Redroid stack (see DEPLOY-GRAVITON.md).
 * `udid` must match the ADB serial ws-scrcpy sees (gateway IP of umbrella-net + 5555).
 */
export const DEFAULT_SCRCPY_UDID =
  process.env.NEXT_PUBLIC_ANDROID_UDID || '172.18.0.1:5555';

export const DEFAULT_SCRCPY_STREAM_URL =
  `/scrcpy/#!action=stream&udid=${DEFAULT_SCRCPY_UDID}&player=mse`;

/**
 * Build-time fallback for the stream URL. The backend's `streamUrl`
 * (from /api/status, /api/launch, /api/launch-package) takes precedence at
 * runtime, so x86 noVNC deployments keep working by setting STREAM_URL on
 * the backend — no forced noVNC / localhost:6080 here any more.
 */
export function getDefaultStreamUrl(): string {
  return process.env.NEXT_PUBLIC_STREAM_URL || DEFAULT_SCRCPY_STREAM_URL;
}

/** True when the stream should be opened as a top-level page (ws-scrcpy). */
export function isScrcpyStreamUrl(url: string): boolean {
  return /\/scrcpy(\/|#|\?|$)/.test(url);
}

/** Resolve a same-origin relative stream path to an absolute URL. */
export function resolveStreamUrl(url: string): string {
  if (typeof window !== 'undefined' && url.startsWith('/')) {
    return `${window.location.origin}${url}`;
  }
  return url;
}

/**
 * Navigate the top-level window (falls back to this frame when embedded in a
 * cross-origin parent). Setting `href` is allowed on a cross-origin Location.
 */
export function navigateTopLevel(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.top) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // ignore and navigate this frame instead
  }
  window.location.href = url;
}
