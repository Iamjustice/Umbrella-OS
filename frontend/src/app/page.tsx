'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import VirtualRemote from './components/VirtualRemote';
import SettingsModal from './components/SettingsModal';
import WidgetRow from './components/WidgetRow';
import DesktopDock from './components/DesktopDock';
import { getApiUrl, getWsUrl, getDefaultStreamUrl } from '../lib/runtimeConfig';

// Android Keycodes mapping for TV Remote & Bluetooth Keyboards
const KEY_MAP: Record<string, number> = {
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Enter: 66,
  NumpadEnter: 66,
  Space: 62,
  Backspace: 67,
  Escape: 4,
  BrowserBack: 4,
  GoBack: 4,
  Back: 4,
  Home: 3,
  KeyH: 3,
  Tab: 61,
  AudioVolumeUp: 24,
  AudioVolumeDown: 25,
  MediaPlayPause: 85,
  MediaFastForward: 90,
  MediaRewind: 89,
  MediaPlay: 126,
  MediaPause: 127,
  MediaStop: 86,
};

const GAMEPAD_BUTTON_MAP: Record<number, number> = {
  0: 96,
  1: 4,
  2: 99,
  3: 100,
  12: 19,
  13: 20,
  14: 21,
  15: 22,
  9: 3,
  8: 82,
};

interface ISpeechRecognition {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface AppItem {
  name: string;
  filename?: string;
  packageName?: string;
  type: 'apk' | 'package';
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const APP_ICON_COLORS = [
  'from-emerald-500/50 to-teal-600/40',
  'from-indigo-500/50 to-violet-600/40',
  'from-sky-500/50 to-blue-600/40',
  'from-amber-500/50 to-orange-600/40',
  'from-rose-500/50 to-pink-600/40',
  'from-fuchsia-500/50 to-purple-600/40',
];

export default function Home() {
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [statusDismissed, setStatusDismissed] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [isPlaystationController, setIsPlaystationController] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [uploadedApps, setUploadedApps] = useState<AppItem[]>([]);
  const [installedPackages, setInstalledPackages] = useState<AppItem[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [adbHealthy, setAdbHealthy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [streamDockVisible, setStreamDockVisible] = useState(true);
  const [showUploads, setShowUploads] = useState(true);
  const [greeting, setGreeting] = useState('Good afternoon');
  const [clockLabel, setClockLabel] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastButtonStateRef = useRef<Record<number, boolean>>({});
  const lastAxisStateRef = useRef<Record<string, boolean>>({});
  const streamUrlRef = useRef<string | null>(null);
  const uploadsSectionRef = useRef<HTMLDivElement | null>(null);
  const remoteSectionRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamDockHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    streamUrlRef.current = streamUrl;
  }, [streamUrl]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setGreeting(greetingForHour(now.getHours()));
      setClockLabel(
        now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      );
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const sendKeyEvent = useCallback((keyCode: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'key', keyCode }));
    }
  }, []);

  const sendTouch = useCallback((x: number, y: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'touch', x, y }));
    }
  }, []);

  /** Show stream dock; auto-hide after ~3s idle. Edge tab brings it back. */
  const bumpStreamDock = useCallback(() => {
    setStreamDockVisible(true);
    if (streamDockHideTimerRef.current) clearTimeout(streamDockHideTimerRef.current);
    streamDockHideTimerRef.current = setTimeout(() => setStreamDockVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!streamUrl) {
      if (streamDockHideTimerRef.current) clearTimeout(streamDockHideTimerRef.current);
      setStreamDockVisible(true);
      return;
    }
    bumpStreamDock();
    return () => {
      if (streamDockHideTimerRef.current) clearTimeout(streamDockHideTimerRef.current);
    };
  }, [streamUrl, bumpStreamDock]);

  const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 130000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out. The emulator may still be booting — wait and retry.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const openStream = (url?: string | null) => {
    // Always prefer same-origin noVNC with resize=scale so remote fills the iframe.
    const remoteNovnc =
      typeof window !== 'undefined'
        ? `${window.location.origin}/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=0`
        : '/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=0';
    let next = url || getDefaultStreamUrl();
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        // Normalize ANY remote stream to scaled noVNC (critical for fullscreen feel)
        next = remoteNovnc;
      } else if (next && next.includes('/novnc') && !next.includes('resize=')) {
        const join = next.includes('?') ? '&' : '?';
        next = `${next}${join}autoconnect=1&resize=scale&reconnect=1&show_dot=0`;
      }
    }
    setStreamUrl(next);
    setIsFullScreen(true);
    setShowRemote(false);
    setStatusDismissed(false);
  };

  const fetchApps = useCallback(async () => {
    setLoadingApps(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/apps`);
      if (res.ok) {
        const data = await res.json();
        setUploadedApps(data.uploadedApps || []);
        setInstalledPackages(data.installedPackages || []);
      }
    } catch (e) {
      console.error('Failed to fetch installed apps', e);
    } finally {
      setLoadingApps(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadInitialAppsAndHealth = async () => {
      try {
        const apiUrl = getApiUrl();
        const [appsRes, statusRes] = await Promise.allSettled([
          fetch(`${apiUrl}/apps`),
          fetch(`${apiUrl}/status`),
        ]);

        if (appsRes.status === 'fulfilled' && appsRes.value.ok && isMounted) {
          const data = await appsRes.value.json();
          setUploadedApps(data.uploadedApps || []);
          setInstalledPackages(data.installedPackages || []);
        }

        if (statusRes.status === 'fulfilled' && statusRes.value.ok && isMounted) {
          const data = await statusRes.value.json();
          setAdbHealthy(data.adbConnected === true && data.bootCompleted !== false);
        }
      } catch (e) {
        console.error('Failed to fetch installed apps/health', e);
      }
    };

    loadInitialAppsAndHealth();
    const interval = setInterval(loadInitialAppsAndHealth, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLaunchPackage = async (packageName: string) => {
    setUploadStatus(`Launching package ${packageName}...`);
    setIsLaunching(true);

    try {
      const apiUrl = getApiUrl();
      const res = await fetchWithTimeout(`${apiUrl}/launch-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || 'Launch failed');
      }

      setUploadStatus(`App ${packageName} launched!`);
      openStream(data.streamUrl);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Launch failed';
      if (/not fully booted/i.test(errorMessage)) {
        setUploadStatus('Starting Android…');
        openStream();
      } else {
        setUploadStatus(errorMessage);
        setStatusDismissed(false);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const handleLaunchUploadedApk = async (filename: string) => {
    setUploadStatus(`Installing and launching ${filename}...`);
    setIsLaunching(true);
    openStream();

    try {
      const apiUrl = getApiUrl();
      const launchRes = await fetchWithTimeout(`${apiUrl}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const launchData = await launchRes.json();
      if (!launchRes.ok || launchData.success === false) {
        throw new Error(launchData.error || launchData.message || 'Launch failed');
      }

      setUploadStatus('App ready! Streaming...');
      openStream(launchData.streamUrl);
      fetchApps();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Launch failed';
      if (/not fully booted/i.test(errorMessage)) {
        setUploadStatus('Starting Android…');
        openStream();
      } else {
        setUploadStatus(errorMessage);
        setStatusDismissed(false);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  // WebSocket reconnect with backoff
  useEffect(() => {
    let cancelled = false;
    let retryMs = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connectWs = () => {
      if (cancelled) return;
      const wsUrl = getWsUrl();
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Umbrella OS Controller WebSocket');
        setWsConnected(true);
        retryMs = 1000;
      };

      ws.onclose = () => {
        console.log('Disconnected from Umbrella OS Controller WebSocket');
        setWsConnected(false);
        if (cancelled) return;
        reconnectTimer = setTimeout(() => {
          retryMs = Math.min(retryMs * 2, 15000);
          connectWs();
        }, retryMs);
      };

      ws.onerror = () => {};
    };

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Keyboard: launcher spatial nav when stream closed; ADB KEY_MAP when stream open
  useEffect(() => {
    const moveLauncherFocus = (direction: 'up' | 'down' | 'left' | 'right') => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('.launcher-focusable')
      ).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none' && el.offsetParent !== null;
      });
      if (nodes.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      let current = nodes.findIndex((n) => n === active || n.contains(active));
      if (current < 0) {
        nodes[0].focus();
        return;
      }

      const curRect = nodes[current].getBoundingClientRect();
      const cx = curRect.left + curRect.width / 2;
      const cy = curRect.top + curRect.height / 2;

      let bestIdx = -1;
      let bestScore = Infinity;

      nodes.forEach((node, idx) => {
        if (idx === current) return;
        const r = node.getBoundingClientRect();
        const nx = r.left + r.width / 2;
        const ny = r.top + r.height / 2;
        const dx = nx - cx;
        const dy = ny - cy;

        let ok = false;
        if (direction === 'left') ok = dx < -8 && Math.abs(dy) < Math.abs(dx) + 40;
        if (direction === 'right') ok = dx > 8 && Math.abs(dy) < Math.abs(dx) + 40;
        if (direction === 'up') ok = dy < -8 && Math.abs(dx) < Math.abs(dy) + 40;
        if (direction === 'down') ok = dy > 8 && Math.abs(dx) < Math.abs(dy) + 40;
        if (!ok) return;

        const score = Math.abs(dx) + Math.abs(dy) * 1.2;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      if (bestIdx >= 0) {
        nodes[bestIdx].focus();
      } else {
        // wrap / step linearly as fallback
        const step = direction === 'left' || direction === 'up' ? -1 : 1;
        const next = (current + step + nodes.length) % nodes.length;
        nodes[next].focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const onLauncher = streamUrlRef.current == null;
      const isArrow =
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight';
      const isActivate = e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter';

      if (onLauncher && (isArrow || isActivate)) {
        if (isActivate) {
          const active = document.activeElement as HTMLElement | null;
          const target =
            (active?.classList.contains('launcher-focusable') ? active : null) ||
            (active?.closest('.launcher-focusable') as HTMLElement | null);
          e.preventDefault();
          e.stopPropagation();
          if (target) target.click();
          else moveLauncherFocus('down'); // seed focus if nothing selected
          return;
        }
        if (isArrow) {
          e.preventDefault();
          e.stopPropagation();
          const dir =
            e.code === 'ArrowUp' || e.key === 'ArrowUp'
              ? 'up'
              : e.code === 'ArrowDown' || e.key === 'ArrowDown'
                ? 'down'
                : e.code === 'ArrowLeft' || e.key === 'ArrowLeft'
                  ? 'left'
                  : 'right';
          moveLauncherFocus(dir);
          return;
        }
      }

      const mapped = KEY_MAP[e.code] ?? KEY_MAP[e.key];
      if (mapped != null) {
        // On launcher, don't steal Escape/Backspace for ADB unless stream is open
        if (onLauncher && (mapped === 4 || mapped === 67 || mapped === 3 || mapped === 61)) {
          return;
        }
        console.log(`[Input]: ${e.code}/${e.key} -> Android Keycode: ${mapped}`);
        e.preventDefault();
        e.stopPropagation();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'key', keyCode: mapped }));
        }
      } else if (e.key.length === 1 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (onLauncher) return;
        wsRef.current.send(JSON.stringify({ type: 'text', text: e.key }));
      }
    };

    const blurIframe = () => {
      try {
        iframeRef.current?.blur();
        if (document.activeElement === iframeRef.current) {
          (document.activeElement as HTMLElement | null)?.blur();
        }
        window.focus();
      } catch {
        /* ignore */
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const t = e.target as Node | null;
      if (t && iframeRef.current && (t === iframeRef.current || iframeRef.current.contains(t))) {
        blurIframe();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('focusin', handleFocusIn, true);
    const interval = setInterval(blurIframe, 1500);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('focusin', handleFocusIn, true);
      clearInterval(interval);
    };
  }, []);

  // Gamepad polling
  useEffect(() => {
    const handleGamepadConnected = (e: GamepadEvent) => {
      console.log('Gamepad connected:', e.gamepad.id);
      setGamepadConnected(true);
      const isPS = /playstation|dualshock|dualsense|054c/i.test(e.gamepad.id);
      setIsPlaystationController(isPS);
    };

    const handleGamepadDisconnected = () => {
      setGamepadConnected(false);
      setIsPlaystationController(false);
    };

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    let animationFrameId: number;
    const DEADZONE = 0.5;
    const sendPadKey = (androidKey: number) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'key', keyCode: androidKey }));
      }
    };

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pressedMap = lastButtonStateRef.current as unknown as Record<string, boolean>;

      for (const gp of gamepads) {
        if (!gp || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) continue;

        gp.buttons.forEach((btn, idx) => {
          const stateKey = `${gp.index}:btn:${idx}`;
          const was = pressedMap[stateKey] || false;
          if (btn.pressed && !was) {
            const androidKey = GAMEPAD_BUTTON_MAP[idx];
            if (androidKey) sendPadKey(androidKey);
          }
          pressedMap[stateKey] = btn.pressed;
        });

        const axes = gp.axes || [];
        const readAxis = (idx: number) => (idx < axes.length ? axes[idx] : 0);
        let ax = readAxis(0);
        let ay = readAxis(1);
        if (Math.abs(ax) < DEADZONE && Math.abs(ay) < DEADZONE && axes.length > 7) {
          ax = readAxis(6);
          ay = readAxis(7);
        }
        const axisState = lastAxisStateRef.current;
        const setAxis = (name: string, active: boolean, keyCode: number) => {
          const key = `${gp.index}:axis:${name}`;
          if (active && !axisState[key]) sendPadKey(keyCode);
          axisState[key] = active;
        };
        setAxis('left', ax < -DEADZONE, 21);
        setAxis('right', ax > DEADZONE, 22);
        setAxis('up', ay < -DEADZONE, 19);
        setAxis('down', ay > DEADZONE, 20);
      }

      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    pollGamepad();

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const toggleVoiceCommand = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice recognition is not supported on this browser.');
      return;
    }

    if (isListeningVoice) {
      setIsListeningVoice(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListeningVoice(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const spokenText = event.results[0][0].transcript;
      setVoiceText(spokenText);
      console.log('[Voice Command]:', spokenText);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'text', text: spokenText }));
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error('Voice recognition error', e);
      setIsListeningVoice(false);
    };

    recognition.onend = () => setIsListeningVoice(false);

    recognition.start();
  };

  const uploadAndLaunchFile = async (file: File) => {
    setUploadStatus(`Uploading ${file.name}...`);
    setIsLaunching(true);

    try {
      const formData = new FormData();
      formData.append('apk', file);
      const apiUrl = getApiUrl();

      const uploadRes = await fetchWithTimeout(`${apiUrl}/upload`, {
        method: 'POST',
        body: formData,
      }, 60000);
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

      setUploadStatus('Installing on emulator (may take a minute)...');
      openStream();

      const launchRes = await fetchWithTimeout(`${apiUrl}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadData.filename }),
      });
      const launchData = await launchRes.json();
      if (!launchRes.ok || launchData.success === false) {
        throw new Error(launchData.error || launchData.message || 'Launch failed');
      }

      setUploadStatus('App ready! Streaming...');
      openStream(launchData.streamUrl);
      fetchApps();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      if (/not fully booted/i.test(errorMessage)) {
        setUploadStatus('Starting Android…');
        openStream();
      } else {
        setUploadStatus(errorMessage);
        setStatusDismissed(false);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const goLauncher = () => {
    setIsFullScreen(false);
    setStreamUrl(null);
    setShowRemote(false);
  };

  const dockItems = useMemo(
    () => [
      {
        id: 'launcher',
        label: 'Launcher',
        icon: '🏠',
        active: streamUrl == null,
        onClick: goLauncher,
      },
      {
        id: 'stream',
        label: 'Stream',
        icon: '📺',
        active: streamUrl != null,
        onClick: () => openStream(),
      },
      {
        id: 'files',
        label: 'Files',
        icon: '📁',
        active: showUploads && streamUrl == null,
        onClick: () => {
          if (streamUrl) goLauncher();
          setShowUploads(true);
          setTimeout(() => {
            uploadsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: '⚙️',
        onClick: () => setSettingsOpen(true),
      },
      {
        id: 'remote',
        label: 'Remote',
        icon: '🎮',
        active: showRemote,
        onClick: () => {
          setShowRemote((v) => {
            const next = !v;
            if (next) {
              setTimeout(() => {
                remoteSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }
            return next;
          });
        },
      },
      {
        id: 'voice',
        label: isListeningVoice ? 'Listening' : 'Voice',
        icon: isListeningVoice ? '🔴' : '🎤',
        active: isListeningVoice,
        onClick: toggleVoiceCommand,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streamUrl, showUploads, showRemote, isListeningVoice]
  );

  return (
    <div className="umbrel-desktop text-white flex flex-col items-center select-none">
      {/* Compact status strip — launcher only */}
      {!streamUrl && <header className="w-full max-w-5xl flex justify-between items-center pt-5 px-4">
        <div className="flex items-center gap-2.5">
          <div className="umbrel-greeting-mark" aria-hidden>
            ☂️
          </div>
          <span className="text-xs font-bold tracking-[0.2em] text-white/90 uppercase">umbrellaOS</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`px-2.5 py-1 rounded-full border ${
              adbHealthy
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/50 border-amber-500/40 text-amber-300'
            }`}
          >
            {adbHealthy ? 'Android Online' : 'ADB…'}
          </span>
          <span
            className={`px-2.5 py-1 rounded-full border ${
              wsConnected
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
            }`}
          >
            {wsConnected ? 'WS' : 'Offline'}
          </span>
        </div>
      </header>}

      {voiceText && (
        <div className="w-full max-w-5xl mt-3 px-4">
          <div className="px-4 py-2 umbrel-glass-dock rounded-xl text-center text-xs font-medium text-indigo-200">
            🎙️ Voice: &quot;{voiceText}&quot;
          </div>
        </div>
      )}

      <main className="w-full max-w-5xl flex-1 flex flex-col items-center justify-start mt-6 gap-8 px-4">
        {streamUrl ? (
          <div className="fixed inset-0 z-40 bg-black flex flex-col">
            {/* Full-bleed Android stream — no dense chrome */}
            <div
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const xPct = (e.clientX - rect.left) / rect.width;
                const yPct = (e.clientY - rect.top) / rect.height;
                sendTouch(Math.round(xPct * 1080), Math.round(yPct * 1920));
              }}
              className="absolute inset-0 w-full h-full cursor-crosshair"
            >
              <iframe
                ref={iframeRef}
                src={streamUrl}
                tabIndex={-1}
                className="block w-full h-full border-0 pointer-events-none"
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Umbrella Android Cloud Display"
                allow="autoplay; fullscreen; microphone"
              />
            </div>

            {uploadStatus && !statusDismissed && !/^Error:.*not ful/i.test(uploadStatus) && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] px-3 py-1.5 umbrel-glass-dock rounded-2xl text-[11px] font-mono text-white/80 max-w-[92vw] sm:max-w-xl flex items-start gap-2 shadow-lg">
                <span className="whitespace-pre-wrap break-words text-left leading-snug">{uploadStatus.replace(/^Error:\s*/i, '')}</span>
                <button type="button" onClick={() => setStatusDismissed(true)} className="shrink-0 text-white/50 hover:text-white mt-0.5" aria-label="Dismiss">✕</button>
              </div>
            )}

            {/* Minimal floating stream dock — auto-hides after idle; edge tab restores */}
            <div
              className="absolute bottom-0 left-0 right-0 z-[60] flex flex-col items-center pointer-events-none"
              onPointerDown={bumpStreamDock}
            >
              {streamDockVisible ? (
                <div
                  className="mb-5 flex flex-col items-center gap-2 pointer-events-auto transition-opacity duration-300 opacity-100"
                  onPointerDown={bumpStreamDock}
                  onPointerMove={bumpStreamDock}
                >
                  {showRemote && (
                    <div ref={remoteSectionRef} className="mb-1">
                      <VirtualRemote
                        isPlaystationControllerConnected={isPlaystationController}
                        onSendKeyEvent={sendKeyEvent}
                      />
                    </div>
                  )}
                  <div className="umbrel-dock-pill px-2 py-1.5 flex items-center gap-1">
                    <button type="button" onClick={goLauncher} title="Launcher" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-sm border border-white/10">🏠</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(4); }} title="Back" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-sm border border-white/10">↩️</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(3); }} title="Home" className="w-9 h-9 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-bold">⌂</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(187); }} title="Recents / Overview" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-sm border border-white/10 font-bold">▢</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(19); }} className="w-7 h-7 rounded-lg bg-white/10 text-[10px] border border-white/10">▲</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(20); }} className="w-7 h-7 rounded-lg bg-white/10 text-[10px] border border-white/10">▼</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(21); }} className="w-7 h-7 rounded-lg bg-white/10 text-[10px] border border-white/10">◄</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(22); }} className="w-7 h-7 rounded-lg bg-white/10 text-[10px] border border-white/10">►</button>
                    <button type="button" onClick={() => { bumpStreamDock(); sendKeyEvent(66); }} title="OK" className="w-9 h-9 rounded-xl bg-indigo-600/90 text-xs font-bold">OK</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={bumpStreamDock}
                  title="Show controls"
                  aria-label="Show stream controls"
                  className="pointer-events-auto mb-1 px-4 py-1.5 rounded-t-xl bg-black/55 border border-white/15 border-b-0 text-white/70 text-[10px] tracking-wide hover:bg-black/70 hover:text-white backdrop-blur-md"
                >
                  ▴ controls
                </button>
              )}
            </div>
          </div>
        ) : (

          <>
            {/* Centered greeting */}
            <div className="w-full flex flex-col items-center text-center pt-6 pb-2 gap-3">
              <div className="umbrel-greeting-mark text-lg" aria-hidden>
                ☂️
              </div>
              <p className="text-sm text-white/60 font-medium tracking-wide">{clockLabel}</p>
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight drop-shadow-lg">
                {greeting}, Justice.
              </h1>
              <p className="text-sm text-white/55 max-w-md">
                Your umbrellaOS cloud Android station
              </p>
            </div>

            <WidgetRow
              adbHealthy={adbHealthy}
              installedCount={installedPackages.length}
              uploadedCount={uploadedApps.length}
              wsConnected={wsConnected}
              gamepadConnected={gamepadConnected}
            />

            {/* App icon grid */}
            <div className="w-full mt-2 space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
                  Apps · {installedPackages.length}
                </h2>
                <button
                  type="button"
                  onClick={fetchApps}
                  tabIndex={0}
                  className="launcher-focusable text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white/80 border border-white/10 transition focus-visible:ring-2 focus-visible:ring-white"
                >
                  {loadingApps ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-6 gap-y-8 justify-items-center">
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  className="launcher-focusable flex flex-col items-center gap-2.5 cursor-pointer group outline-none"
                >
                  <div
                    className={`w-[4.75rem] h-[4.75rem] umbrel-app-icon rounded-[1.35rem] flex items-center justify-center text-3xl ${
                      isLaunching ? 'animate-pulse bg-indigo-600/40' : 'bg-gradient-to-tr from-white/20 to-white/5'
                    }`}
                  >
                    {isLaunching ? '⏳' : '➕'}
                  </div>
                  <span className="text-xs font-semibold text-white/90 truncate max-w-[96px]">
                    {isLaunching ? 'Installing…' : 'Install APK'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".apk"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        uploadAndLaunchFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </button>

                {installedPackages.length === 0 && !isLaunching && (
                  <p className="col-span-full text-xs text-white/45 text-center py-2">
                    No third-party apps yet. Install an APK to populate the grid.
                  </p>
                )}

                {installedPackages.map((app, idx) => (
                  <button
                    key={`pkg-${app.packageName || idx}`}
                    type="button"
                    tabIndex={0}
                    title={app.packageName}
                    onClick={() => app.packageName && handleLaunchPackage(app.packageName)}
                    className="launcher-focusable flex flex-col items-center gap-2.5 cursor-pointer group outline-none"
                  >
                    <div
                      className={`w-[4.75rem] h-[4.75rem] umbrel-app-icon rounded-[1.35rem] flex items-center justify-center text-3xl bg-gradient-to-tr ${
                        APP_ICON_COLORS[idx % APP_ICON_COLORS.length]
                      }`}
                    >
                      🤖
                    </div>
                    <span className="text-xs font-semibold text-white/90 truncate max-w-[96px]">
                      {app.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quieter APK uploads section */}
            <div
              ref={uploadsSectionRef}
              className={`w-full umbrel-section-quiet pt-2 ${showUploads ? '' : ''}`}
            >
              <button
                type="button"
                onClick={() => setShowUploads((v) => !v)}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 hover:text-white/70 mb-3"
              >
                <span>APK files on server · {uploadedApps.length}</span>
                <span className="text-white/30">{showUploads ? '▾' : '▸'}</span>
              </button>

              {showUploads && (
                <>
                  <p className="text-[11px] text-white/40 mb-4 max-w-2xl">
                    Uploaded <span className="font-mono">.apk</span> files — tap to install on the emulator.
                    They appear under Apps after ADB install succeeds.
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-6 gap-y-8 justify-items-center opacity-90">
                    {uploadedApps.length === 0 && (
                      <p className="col-span-full text-xs text-white/40">No APK uploads yet.</p>
                    )}
                    {uploadedApps.map((app, idx) => (
                      <button
                        key={`apk-${app.filename || idx}`}
                        type="button"
                        tabIndex={0}
                        onClick={() => app.filename && handleLaunchUploadedApk(app.filename)}
                        className="launcher-focusable flex flex-col items-center gap-2.5 cursor-pointer group outline-none"
                      >
                        <div className="w-[4.25rem] h-[4.25rem] umbrel-app-icon rounded-[1.2rem] flex items-center justify-center text-2xl bg-gradient-to-tr from-indigo-600/35 to-violet-600/30">
                          📦
                        </div>
                        <span className="text-[11px] font-medium text-white/75 truncate max-w-[90px]">
                          {app.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {uploadStatus && (
              <div className="p-3 umbrel-widget rounded-2xl w-full text-left">
                <p className="text-xs font-mono text-emerald-400">➜ {uploadStatus}</p>
              </div>
            )}

            {showRemote && (
              <div ref={remoteSectionRef} className="mt-2 flex justify-center w-full pb-4">
                <VirtualRemote
                  isPlaystationControllerConnected={isPlaystationController}
                  onSendKeyEvent={sendKeyEvent}
                />
              </div>
            )}
          </>
        )}
      </main>

      {!streamUrl && <DesktopDock items={dockItems} />}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        adbHealthy={adbHealthy}
        onRefreshApps={() => {
          fetchApps();
        }}
      />
    </div>
  );
}
