'use client';

interface WidgetRowProps {
  adbHealthy: boolean;
  installedCount: number;
  uploadedCount: number;
  wsConnected: boolean;
  gamepadConnected: boolean;
}

export default function WidgetRow({
  adbHealthy,
  installedCount,
  uploadedCount,
  wsConnected,
  gamepadConnected,
}: WidgetRowProps) {
  return (
    <div className="w-full max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 px-2">
      {/* Android / ADB */}
      <div className="umbrel-widget p-5 flex flex-col gap-3 min-h-[110px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl border ${
                adbHealthy
                  ? 'bg-emerald-500/20 border-emerald-400/30'
                  : 'bg-amber-500/20 border-amber-400/30'
              }`}
            >
              🤖
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Android</p>
              <p className="text-sm font-bold text-white">
                {adbHealthy ? 'Online' : 'Connecting…'}
              </p>
            </div>
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              adbHealthy ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse'
            }`}
          />
        </div>
        <p className="text-[11px] text-white/55 font-mono">ADB :5555 · emulator</p>
      </div>

      {/* Apps / storage-ish */}
      <div className="umbrel-widget p-5 flex flex-col gap-3 min-h-[110px]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl">
            📦
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Apps</p>
            <p className="text-sm font-bold text-white">
              {installedCount} installed
            </p>
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500"
            style={{ width: `${Math.min(100, Math.max(8, installedCount * 12 + uploadedCount * 4))}%` }}
          />
        </div>
        <p className="text-[11px] text-white/55">{uploadedCount} APK file{uploadedCount === 1 ? '' : 's'} on server</p>
      </div>

      {/* Controller / WS */}
      <div className="umbrel-widget p-5 flex flex-col gap-3 min-h-[110px]">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl border ${
              wsConnected
                ? 'bg-violet-500/20 border-violet-400/30'
                : 'bg-rose-500/20 border-rose-400/30'
            }`}
          >
            🎮
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Controls</p>
            <p className="text-sm font-bold text-white">
              {wsConnected ? 'WS connected' : 'WS offline'}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-white/55">
          {gamepadConnected ? 'Gamepad paired' : 'TV remote · keyboard · voice'}
        </p>
      </div>
    </div>
  );
}
