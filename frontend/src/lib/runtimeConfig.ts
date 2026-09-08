/**
 * Browser-side URLs for API / WS / noVNC.
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

export function getDefaultStreamUrl(): string {
  if (isRemoteBrowser()) {
    return `${window.location.origin}/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=0`;
  }
  return process.env.NEXT_PUBLIC_STREAM_URL || 'http://localhost:6080';
}
