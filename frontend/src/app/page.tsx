'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import VirtualRemote from './components/VirtualRemote';
import SystemStatsWidget from './components/SystemStatsWidget';
import AppStoreModal from './components/AppStoreModal';
import SettingsModal from './components/SettingsModal';
import { getApiUrl, getWsUrl, getDefaultStreamUrl } from '../lib/runtimeConfig';

// Android Keycodes mapping for TV Remote & Bluetooth Keyboards
const KEY_MAP: Record<string, number> = {
  ArrowUp: 19,      // DPAD_UP
  ArrowDown: 20,    // DPAD_DOWN
  ArrowLeft: 21,    // DPAD_LEFT
  ArrowRight: 22,   // DPAD_RIGHT
  Enter: 66,        // ENTER / KEYCODE_ENTER
  NumpadEnter: 66,
  Space: 62,        // SPACE
  Backspace: 67,    // DEL / BACKSPACE
  Escape: 4,        // BACK
  BrowserBack: 4,   // Hisense / TV BrowserBack
  GoBack: 4,
  Back: 4,
  Home: 3,          // HOME
  KeyH: 3,          // HOME shortcut
  Tab: 61,          // TAB
  AudioVolumeUp: 24,
  AudioVolumeDown: 25,
  MediaPlayPause: 85,
  MediaFastForward: 90,
  MediaRewind: 89,
  MediaPlay: 126,
  MediaPause: 127,
  MediaStop: 86,
};

// Gamepad Button Map to Android Keycodes
const GAMEPAD_BUTTON_MAP: Record<number, number> = {
  0: 96,  // A (BUTTON_A / SELECT)
  1: 4,   // B (BACK)
  2: 99,  // X (BUTTON_X)
  3: 100, // Y (BUTTON_Y)
  12: 19, // DPAD_UP
  13: 20, // DPAD_DOWN
  14: 21, // DPAD_LEFT
  15: 22, // DPAD_RIGHT
  9: 3,   // START -> HOME
  8: 82,  // SELECT -> MENU
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

export default function Home() {
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [isPlaystationController, setIsPlaystationController] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);

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
    // Prefer same-origin autoconnect noVNC on remote hosts (Caddy). Absolute :6080 often isn't published.
    const remoteNovnc =
      typeof window !== 'undefined'
        ? `${window.location.origin}/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=0`
        : '/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=0';
    let next = url || getDefaultStreamUrl();
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        if (
          !next ||
          next.includes(':6080') ||
          next === 'http://localhost:6080' ||
          next.endsWith('/novnc/') ||
          next.endsWith('/novnc')
        ) {
          next = remoteNovnc;
        }
      }
    }
    setStreamUrl(next);
    // Keep VirtualRemote visible after launch (fullscreen hid remotes before).
    setIsFullScreen(false);
  };

  const [voiceText, setVoiceText] = useState('');
  const [uploadedApps, setUploadedApps] = useState<AppItem[]>([]);
  const [installedPackages, setInstalledPackages] = useState<AppItem[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastButtonStateRef = useRef<Record<number, boolean>>({});
  const lastAxisStateRef = useRef<Record<string, boolean>>({});

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

  const [adbHealthy, setAdbHealthy] = useState(false);
  const [streamFit, setStreamFit] = useState<'contain' | 'cover'>('contain');

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
      setUploadStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleLaunchUploadedApk = async (filename: string) => {
    setUploadStatus(`Installing and launching ${filename}...`);
    setIsLaunching(true);
    // Show stream shell early so TV isn't stuck on a blank "installing" state with no feedback
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
      setUploadStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // 1. Initialize WebSocket for real-time TV remote / controller input (reconnect w/ backoff)
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

      ws.onerror = () => {
        // onclose will fire and schedule reconnect
      };
    };

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // 2. Listen to TV Remote & Bluetooth Keyboard events (capture so Hisense keys beat iframe focus)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mapped = KEY_MAP[e.code] ?? KEY_MAP[e.key];
      if (mapped != null) {
        console.log(`[Input]: ${e.code}/${e.key} -> Android Keycode: ${mapped}`);
        e.preventDefault();
        e.stopPropagation();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'key',
              keyCode: mapped,
            })
          );
        }
      } else if (e.key.length === 1 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Standard typing from Bluetooth keyboards
        wsRef.current.send(
          JSON.stringify({
            type: 'text',
            text: e.key,
          })
        );
      }
    };

    const blurIframe = () => {
      try {
        iframeRef.current?.blur();
        if (document.activeElement === iframeRef.current) {
          (document.activeElement as HTMLElement | null)?.blur();
        }
        // Prefer focus on the parent document so TV remotes hit our keydown handler
        window.focus();
      } catch {
        /* ignore cross-origin */
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

  // 3. Bluetooth Gamepad / Controller API Polling
  useEffect(() => {
    const handleGamepadConnected = (e: GamepadEvent) => {
      console.log('Gamepad connected:', e.gamepad.id);
      setGamepadConnected(true);
      const isPS = /playstation|dualshock|dualsense|054c/i.test(e.gamepad.id);
      setIsPlaystationController(isPS);
    };

    const handleGamepadDisconnected = () => {
      console.log('Gamepad disconnected');
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

        // Axes: left stick (0/1) or hat (6/7) -> D-pad with deadzone
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

  // 4. Voice Command / Speech-to-Text Support
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

      // Send spoken text directly to Android app
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'text',
            text: spokenText,
          })
        );
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
      setUploadStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-between p-6 select-none">
      {/* Umbrel OS Top Navigation Bar */}
      <header className="w-full max-w-6xl flex justify-between items-center py-3.5 px-6 umbrel-glass-dock rounded-2xl border border-slate-700/40 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-base font-black shadow-lg">
            ☂️
          </div>
          <span className="text-sm font-black tracking-widest text-slate-100 uppercase">umbrellaOS</span>
        </div>

        {/* Status Indicators Badge Bar */}
        <div className="flex items-center gap-2.5">
          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
            adbHealthy ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300' : 'bg-amber-950/70 border-amber-500/50 text-amber-300'
          }`}>
            {adbHealthy ? '🤖 Android Online' : '⚠️ ADB Connecting...'}
          </span>

          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
            wsConnected ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300' : 'bg-rose-950/70 border-rose-500/50 text-rose-300'
          }`}>
            {wsConnected ? '● Controller Active' : '○ Offline'}
          </span>

          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
            gamepadConnected ? 'bg-indigo-950/70 border-indigo-500/50 text-indigo-300' : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
          }`}>
            {gamepadConnected ? '🎮 Gamepad' : '🎮 Gamepad'}
          </span>

          <button
            onClick={toggleVoiceCommand}
            className={`px-3.5 py-1 rounded-full text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
              isListeningVoice
                ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg'
                : 'bg-slate-800/80 border-slate-700/60 hover:bg-slate-700/80 text-slate-200'
            }`}
          >
            🎤 {isListeningVoice ? 'Listening...' : 'Voice'}
          </button>

          {streamUrl && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStreamFit(streamFit === 'contain' ? 'cover' : 'contain')}
                className="bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs px-3.5 py-1 rounded-full font-semibold border border-slate-700/60 transition"
              >
                {streamFit === 'contain' ? '📺 Fit Window' : '📺 Stretch Fill'}
              </button>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="umbrel-button-primary text-white text-[11px] px-3.5 py-1 rounded-full font-bold transition"
              >
                {isFullScreen ? 'Minimize' : 'Full Screen'}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Voice feedback toast */}
      {voiceText && (
        <div className="w-full max-w-6xl mt-3 px-4 py-2 umbrel-glass-dock border border-indigo-500/40 rounded-xl text-center text-xs font-medium text-indigo-200 shadow-xl">
          🎙️ Voice Typed: &quot;{voiceText}&quot;
        </div>
      )}

      {/* Main Umbrel OS Desktop Area */}
      <main className="w-full max-w-6xl flex-1 flex flex-col items-center justify-start my-6 gap-8">
        {streamUrl ? (
          /* Stream + always-visible Android nav (Home/Back/Settings) */
          <div className={`w-full flex flex-col gap-4 ${isFullScreen ? 'fixed inset-0 z-50 bg-slate-950 p-3' : ''}`}>
            <div className="w-full flex flex-wrap items-center justify-center gap-2 umbrel-glass-dock rounded-2xl px-3 py-2 border border-slate-700/50 pointer-events-auto z-[60]">
              <button
                type="button"
                onClick={() => sendKeyEvent(4)}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ↩️ Back
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(3)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-xs font-bold shadow"
              >
                🏠 Home
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(19)}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(20)}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(21)}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ◄
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(22)}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ►
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(66)}
                className="px-3 py-2 rounded-xl bg-indigo-700/90 hover:bg-indigo-600 text-xs font-bold border border-indigo-500"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => sendKeyEvent(187)}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ▢ Recents
              </button>
              <button
                type="button"
                onClick={() => handleLaunchPackage('com.android.settings')}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                ⚙️ Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFullScreen(false);
                  setStreamUrl(null);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold border border-slate-600"
              >
                📋 Launcher
              </button>
              <a
                href={streamUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-xs font-semibold border border-emerald-600"
              >
                ↗ Open stream
              </a>
              <button
                type="button"
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="px-3 py-2 rounded-xl umbrel-button-primary text-xs font-bold"
              >
                {isFullScreen ? '⬇ Minimize' : '⬆ Full Screen'}
              </button>
            </div>

            <div
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const xPct = (e.clientX - rect.left) / rect.width;
                const yPct = (e.clientY - rect.top) / rect.height;
                const tapX = Math.round(xPct * 1080);
                const tapY = Math.round(yPct * 1920);
                sendTouch(tapX, tapY);
              }}
              className={`w-full umbrel-glass-dock rounded-3xl overflow-hidden shadow-2xl border border-slate-700/40 flex flex-col items-center justify-center relative cursor-crosshair ${
                isFullScreen ? 'flex-1 min-h-0 rounded-2xl' : 'h-[620px]'
              }`}
            >
              <iframe
                ref={iframeRef}
                src={streamUrl}
                tabIndex={-1}
                className={`w-full h-full border-0 pointer-events-none ${streamFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                title="Umbrella Android Cloud Display"
                allow="autoplay; fullscreen; microphone"
              />
            </div>

            <div className="flex justify-center w-full pointer-events-auto z-[60]">
              <VirtualRemote
                isPlaystationControllerConnected={isPlaystationController}
                onSendKeyEvent={sendKeyEvent}
              />
            </div>
            {uploadStatus && (
              <div className="p-3 umbrel-widget rounded-2xl w-full text-left">
                <p className="text-xs font-mono text-emerald-400">➜ {uploadStatus}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Greeting Header & System Status Widgets */}
            <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-4">
              <div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
                  Good afternoon.
                </h1>
                <p className="text-slate-300 text-sm mt-1 drop-shadow">
                  Welcome to your Umbrella OS Cloud Android Station.
                </p>
              </div>

              {/* Umbrel Desktop System Widgets */}
              <div className="flex items-center gap-4">
                {/* System Storage Widget */}
                <div className="umbrel-widget p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg">
                    💾
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Container</p>
                    <p className="text-sm font-bold text-slate-100">{installedPackages.length} Apps Installed</p>
                  </div>
                </div>

                {/* System Status Widget */}
                <div className="umbrel-widget p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-lg">
                    ⚡
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">ADB Status</p>
                    <p className="text-sm font-bold text-slate-100">{adbHealthy ? 'Connected (5555)' : 'Connecting...'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Apps: installed on device vs APK files waiting to install */}
            <div className="w-full mt-4 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 drop-shadow">
                  On device ({installedPackages.length})
                </h2>
                <button
                  onClick={fetchApps}
                  className="text-xs px-3 py-1 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border border-slate-700/50 transition"
                >
                  🔄 {loadingApps ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                <label className="flex flex-col items-center gap-2 cursor-pointer group">
                  <div className={`w-20 h-20 umbrel-app-icon rounded-3xl flex items-center justify-center text-3xl transition-all ${
                    isLaunching ? 'animate-pulse bg-indigo-600/50' : 'group-hover:scale-105'
                  }`}>
                    {isLaunching ? '⏳' : '➕'}
                  </div>
                  <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition">
                    {isLaunching ? 'Installing...' : 'Install APK'}
                  </span>
                  <input
                    type="file"
                    accept=".apk"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        uploadAndLaunchFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>

                {installedPackages.length === 0 && !isLaunching && (
                  <p className="col-span-full text-xs text-slate-400">
                    No third-party apps on the emulator yet. Upload an APK, or open the Android app drawer on the stream after install succeeds.
                  </p>
                )}

                {installedPackages.map((app, idx) => (
                  <div
                    key={`pkg-${app.packageName || idx}`}
                    onClick={() => app.packageName && handleLaunchPackage(app.packageName)}
                    className="flex flex-col items-center gap-2 cursor-pointer group"
                    title={app.packageName}
                  >
                    <div className="w-20 h-20 umbrel-app-icon rounded-3xl flex items-center justify-center text-3xl group-hover:scale-105 transition-all bg-gradient-to-tr from-emerald-600/40 to-teal-600/40">
                      🤖
                    </div>
                    <span className="text-xs font-semibold text-slate-200 truncate max-w-[90px] group-hover:text-white transition">
                      {app.name}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 drop-shadow mb-2">
                  APK files on server ({uploadedApps.length})
                </h2>
                <p className="text-[11px] text-slate-400 mb-4">
                  These are uploaded <span className="font-mono">.apk</span> files — not launcher icons. Tap one to install/reinstall on the emulator. They only move to &quot;On device&quot; after ADB install succeeds.
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                  {uploadedApps.map((app, idx) => (
                    <div
                      key={`apk-${app.filename || idx}`}
                      onClick={() => app.filename && handleLaunchUploadedApk(app.filename)}
                      className="flex flex-col items-center gap-2 cursor-pointer group"
                    >
                      <div className="w-20 h-20 umbrel-app-icon rounded-3xl flex items-center justify-center text-3xl group-hover:scale-105 transition-all bg-gradient-to-tr from-indigo-600/40 to-violet-600/40">
                        📦
                      </div>
                      <span className="text-xs font-semibold text-slate-200 truncate max-w-[90px] group-hover:text-white transition">
                        {app.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {uploadStatus && (
                <div className="mt-2 p-3 umbrel-widget rounded-2xl w-full text-left">
                  <p className="text-xs font-mono text-emerald-400">➜ {uploadStatus}</p>
                </div>
              )}
            </div>

            {/* Virtual D-Pad Controller Widget */}
            <div className="mt-4 flex justify-center w-full">
              <VirtualRemote
                isPlaystationControllerConnected={isPlaystationController}
                onSendKeyEvent={sendKeyEvent}
              />
            </div>
          </>
        )}
      </main>

      {/* Umbrel OS Dock Footer */}
      <footer className="w-full max-w-2xl py-3 px-6 umbrel-glass-dock rounded-full border border-slate-700/50 shadow-2xl flex items-center justify-around text-slate-300 text-xs">
        <span className="flex items-center gap-1.5 font-medium">🎮 Controls</span>
        <span className="text-slate-600">•</span>
        <span>📺 D-Pad / OK / Back</span>
        <span className="text-slate-600">•</span>
        <span>⌨️ Keyboard</span>
        <span className="text-slate-600">•</span>
        <span>🕹️ Gamepad</span>
        <span className="text-slate-600">•</span>
        <span>🎙️ Voice</span>
      </footer>
    </div>
  );
}
