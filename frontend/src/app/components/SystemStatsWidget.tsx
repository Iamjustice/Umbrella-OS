'use client';
import { useState, useEffect } from 'react';

interface StatsData {
  cpuLoad: string;
  memory: string;
  storage: string;
  adbConnected: boolean;
}

export default function SystemStatsWidget() {
  const [stats, setStats] = useState<StatsData>({
    cpuLoad: '12%',
    memory: '4.2 GB / 16 GB',
    storage: '24.5 GB used of 100 GB',
    adbConnected: false,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchStats = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        const res = await fetch(`${apiUrl}/system/stats`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Failed to fetch system stats', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Storage Glass Widget */}
      <div className="umbrel-widget p-4 flex items-center gap-3.5 shadow-lg border border-slate-700/40">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-lg shadow-inner">
          📁
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Storage</p>
          <p className="text-sm font-extrabold text-slate-100">{stats.storage}</p>
          <p className="text-[10px] text-amber-400/90 font-mono mt-0.5">75.5 GB available</p>
        </div>
      </div>

      {/* CPU / RAM / System Metrics Glass Widget */}
      <div className="umbrel-widget p-4 flex items-center gap-6 shadow-lg border border-slate-700/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm">
            ⚙️
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">CPU</p>
            <p className="text-sm font-extrabold text-slate-100">{stats.cpuLoad}</p>
          </div>
        </div>

        <div className="w-[1px] h-8 bg-slate-700/60"></div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm">
            🧠
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Memory</p>
            <p className="text-sm font-extrabold text-slate-100">{stats.memory}</p>
          </div>
        </div>

        <div className="w-[1px] h-8 bg-slate-700/60"></div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm">
            🤖
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Container</p>
            <p className={`text-sm font-extrabold ${stats.adbConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {stats.adbConnected ? 'Active' : 'Standby'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
