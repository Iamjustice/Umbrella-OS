'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import VirtualRemote from './components/VirtualRemote';
import SystemStatsWidget from './components/SystemStatsWidget';
import AppStoreModal from './components/AppStoreModal';
import SettingsModal from './components/SettingsModal';

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
  Home: 3,          // HOME
  KeyH: 3,          // HOME shortcut
  Tab: 61,          // TAB
  AudioVolumeUp: 24,
  AudioVolumeDown: 25,
  MediaPlayPause: 85,
  MediaFastForward: 90,
  MediaRewind: 89,
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
  const [voiceText, setVoiceText] = useState('');
  const [uploadedApps, setUploadedApps] = useState<AppItem[]>([]);
  const [installedPackages, setInstalledPackages] = useState<AppItem[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastButtonStateRef = useRef<Record<number, boolean>>({});

  const fetchApps = useCallback(async () => {
    setLoadingApps(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
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
          setAdbHealthy(data.adbConnected === true);
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/launch-package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Launch failed');

      setUploadStatus(`App ${packageName} launched!`);
      setStreamUrl(data.streamUrl || 'http://localhost:6080');
      setIsFullScreen(true);
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

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const launchRes = await fetch(`${apiUrl}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const launchData = await launchRes.json();
      if (!launchRes.ok) throw new Error(launchData.error || 'Launch failed');

      setUploadStatus('App ready! Streaming...');
      setStreamUrl(launchData.streamUrl || 'http://localhost:6080');
      setIsFullScreen(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Launch failed';
      setUploadStatus(`Error: ${errorMessage}`);
    } finally {
      setIsLaunching(false);
    }
  };

  // 1. Initialize WebSocket for real-time TV remote / controller input
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to Umbrella OS Controller WebSocket');
      setWsConnected(true);
    };

    ws.onclose = () => {
      console.log('Disconnected from Umbrella OS Controller WebSocket');
      setWsConnected(false);
    };

    const ref = wsRef;
    ref.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  // 2. Listen to TV Remote & Bluetooth Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (KEY_MAP[e.code]) {
        console.log(`[Input]: ${e.code} -> Android Keycode: ${KEY_MAP[e.code]}`);
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'key',
              keyCode: KEY_MAP[e.code],
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];

      if (gp && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        gp.buttons.forEach((btn, idx) => {
          const wasPressed = lastButtonStateRef.current[idx] || false;
          if (btn.pressed && !wasPressed) {
            const androidKey = GAMEPAD_BUTTON_MAP[idx];
            if (androidKey) {
              wsRef.current?.send(
                JSON.stringify({
                  type: 'key',
                  keyCode: androidKey,
                })
              );
            }
          }
          lastButtonStateRef.current[idx] = btn.pressed;
        });
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

      const uploadRes = await fetch(`${apiUrl}/upload`, {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

      setUploadStatus('Installing package on container...');

      const launchRes = await fetch(`${apiUrl}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadData.filename }),
      });
      const launchData = await launchRes.json();
      if (!launchRes.ok) throw new Error(launchData.error || 'Launch failed');

      setUploadStatus('App ready! Streaming...');
      setStreamUrl(launchData.streamUrl || 'http://localhost:6080');
      setIsFullScreen(true);
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
          /* Stream View Display */
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
              isFullScreen ? 'fixed inset-0 z-50 rounded-none border-0' : 'h-[620px]'
            }`}
          >
            <iframe
              src={streamUrl}
              className={`w-full h-full border-0 pointer-events-none ${streamFit === 'cover' ? 'object-cover' : 'object-contain'}`}
              title="Umbrella Android Cloud Display"
              allow="autoplay; fullscreen"
            />
            {isFullScreen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullScreen(false);
                }}
                className="absolute top-6 right-6 umbrel-glass-dock hover:bg-slate-800 text-white px-6 py-2 rounded-full border border-slate-700 font-medium z-50 shadow-xl pointer-events-auto"
              >
                ✕ Exit Full Screen
              </button>
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

            {/* Umbrel OS App Icons Grid */}
            <div className="w-full mt-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 drop-shadow">
                  Applications ({uploadedApps.length + installedPackages.length})
                </h2>
                <button
                  onClick={fetchApps}
                  className="text-xs px-3 py-1 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 border border-slate-700/50 transition"
                >
                  🔄 {loadingApps ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {/* App Icon Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                {/* APK Upload Launcher Tile */}
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

                {/* Uploaded APKs */}
                {uploadedApps.map((app, idx) => (
                  <div
                    key={`apk-${idx}`}
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

                {/* Installed Packages */}
                {installedPackages.map((app, idx) => (
                  <div
                    key={`pkg-${idx}`}
                    onClick={() => app.packageName && handleLaunchPackage(app.packageName)}
                    className="flex flex-col items-center gap-2 cursor-pointer group"
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

              {/* Status Feedback Banner */}
              {uploadStatus && (
                <div className="mt-6 p-3 umbrel-widget rounded-2xl w-full text-left">
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
