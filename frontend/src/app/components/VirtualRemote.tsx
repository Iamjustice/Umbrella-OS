'use client';

interface VirtualRemoteProps {
  isPlaystationControllerConnected: boolean;
  onSendKeyEvent: (keyCode: number) => void;
}

export default function VirtualRemote({
  isPlaystationControllerConnected,
  onSendKeyEvent,
}: VirtualRemoteProps) {
  const handleKey = (keyCode: number) => {
    onSendKeyEvent(keyCode);
  };

  return (
    <div className="umbrel-glass-card rounded-3xl p-6 shadow-2xl w-full max-w-sm flex flex-col items-center select-none border border-slate-700/40">
      {/* Widget Header */}
      <div className="w-full flex items-center justify-between mb-5 pb-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm">
            🎮
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-wider uppercase">Virtual Remote</h3>
            <p className="text-[10px] text-slate-400">
              {isPlaystationControllerConnected ? '🎮 DualSense / PS Controller Active' : '📺 Smart TV Navigation'}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
          isPlaystationControllerConnected ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' : 'bg-slate-800/80 border-slate-700 text-slate-400'
        }`}>
          {isPlaystationControllerConnected ? 'PS Active' : 'Remote Mode'}
        </span>
      </div>

      {/* Playstation Style D-Pad & Action Buttons */}
      <div className="w-full flex flex-col items-center gap-6">
        <div className="flex items-center justify-between w-full px-2">
          {/* D-PAD Cross */}
          <div className="relative w-32 h-32 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-center p-2 shadow-inner">
            <button
              onClick={() => handleKey(19)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(19); }} // UP
              className="absolute top-1 w-10 h-10 bg-slate-800/90 hover:bg-indigo-600 active:scale-95 text-white rounded-lg flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ▲
            </button>
            <button
              onClick={() => handleKey(21)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(21); }} // LEFT
              className="absolute left-1 w-10 h-10 bg-slate-800/90 hover:bg-indigo-600 active:scale-95 text-white rounded-lg flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ◄
            </button>
            <button
              onClick={() => handleKey(66)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(66); }} // CENTER / OK
              className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 active:scale-90 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg transition-all"
            >
              OK
            </button>
            <button
              onClick={() => handleKey(22)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(22); }} // RIGHT
              className="absolute right-1 w-10 h-10 bg-slate-800/90 hover:bg-indigo-600 active:scale-95 text-white rounded-lg flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ►
            </button>
            <button
              onClick={() => handleKey(20)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(20); }} // DOWN
              className="absolute bottom-1 w-10 h-10 bg-slate-800/90 hover:bg-indigo-600 active:scale-95 text-white rounded-lg flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ▼
            </button>
          </div>

          {/* PlayStation Action Buttons (Triangle, Circle, Cross, Square) */}
          <div className="relative w-32 h-32 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-center p-2 shadow-inner">
            {/* Triangle (Y) */}
            <button
              onClick={() => handleKey(100)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(100); }}
              className="absolute top-1 w-10 h-10 bg-slate-800/90 hover:bg-emerald-600 active:scale-95 text-emerald-400 hover:text-white rounded-full flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ▲
            </button>
            {/* Square (X) */}
            <button
              onClick={() => handleKey(99)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(99); }}
              className="absolute left-1 w-10 h-10 bg-slate-800/90 hover:bg-pink-600 active:scale-95 text-pink-400 hover:text-white rounded-full flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ■
            </button>
            {/* Circle (B -> BACK) */}
            <button
              onClick={() => handleKey(4)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(4); }}
              className="absolute right-1 w-10 h-10 bg-slate-800/90 hover:bg-rose-600 active:scale-95 text-rose-400 hover:text-white rounded-full flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ●
            </button>
            {/* Cross (A -> SELECT) */}
            <button
              onClick={() => handleKey(96)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(96); }}
              className="absolute bottom-1 w-10 h-10 bg-slate-800/90 hover:bg-blue-600 active:scale-95 text-blue-400 hover:text-white rounded-full flex items-center justify-center font-black border border-slate-700/60 shadow transition-all"
            >
              ✖
            </button>
          </div>
        </div>

        {/* System Action Controls */}
        <div className="grid grid-cols-3 gap-2.5 w-full">
          <button
            onClick={() => handleKey(4)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(4); }}
            className="py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 rounded-xl text-xs font-semibold border border-slate-700/50 transition-all flex items-center justify-center gap-1"
          >
            ↩️ BACK
          </button>
          <button
            onClick={() => handleKey(3)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(3); }}
            className="py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center justify-center gap-1"
          >
            🏠 HOME
          </button>
          <button
            onClick={() => handleKey(82)}
              onPointerDown={(e) => { e.preventDefault(); handleKey(82); }}
            className="py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 rounded-xl text-xs font-semibold border border-slate-700/50 transition-all flex items-center justify-center gap-1"
          >
            ☰ MENU
          </button>
        </div>
      </div>
    </div>
  );
}
