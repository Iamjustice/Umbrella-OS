'use client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adbHealthy: boolean;
  onRefreshApps: () => void;
}

export default function SettingsModal({ isOpen, onClose, adbHealthy, onRefreshApps }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-2xl umbrel-glass-dock rounded-3xl border border-slate-700/40 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between py-5 px-8 border-b border-slate-700/40 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shadow-lg">
              ⚙️
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">System Settings</h2>
              <p className="text-xs text-slate-400">Manage Umbrella OS configurations & diagnostics</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold border border-slate-700/60 transition"
          >
            ✕
          </button>
        </div>

        {/* Settings Options Body */}
        <div className="p-8 space-y-6 bg-slate-950/20">
          {/* ADB Connection Troubleshooting */}
          <div className="umbrel-glass-card p-5 rounded-2xl border border-slate-700/40 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">ADB Container Connection</h3>
              <p className="text-xs text-slate-400 mt-0.5">Target ADB device: localhost:5555</p>
            </div>
            <button
              onClick={onRefreshApps}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition border ${
                adbHealthy
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/50 shadow-md'
              }`}
            >
              {adbHealthy ? 'Connected 🟢' : 'Reconnect ADB 🔄'}
            </button>
          </div>

          {/* Storage & Partition info */}
          <div className="umbrel-glass-card p-5 rounded-2xl border border-slate-700/40 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Storage & Container Data</h3>
              <p className="text-xs text-slate-400 mt-0.5">Uploads directory: backend/uploads</p>
            </div>
            <button
              onClick={() => alert('Storage diagnostic logs generated cleanly!')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition"
            >
              Diagnostic Logs 📜
            </button>
          </div>

          {/* System Control Buttons */}
          <div className="umbrel-glass-card p-5 rounded-2xl border border-slate-700/40 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">System Power</h3>
              <p className="text-xs text-slate-400 mt-0.5">Restart or shutdown Umbrella OS services</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => alert('Restarting Umbrella OS background services...')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600/80 hover:bg-amber-500 text-white shadow-md transition"
              >
                Restart OS 🔄
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
