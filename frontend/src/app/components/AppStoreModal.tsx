'use client';
import { useState, useEffect } from 'react';

interface AppStoreItem {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  gradient: string;
}

interface AppStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = ['Discover', 'AI', 'Media', 'Bitcoin', 'Files & Productivity', 'Networking', 'Home & Automation'];

export default function AppStoreModal({ isOpen, onClose }: AppStoreModalProps) {
  const [apps, setApps] = useState<AppStoreItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Discover');
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchStoreApps = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
          const res = await fetch(`${apiUrl}/appstore/apps`);
          if (res.ok) {
            const data = await res.json();
            setApps(data.apps || []);
          }
        } catch (e) {
          console.error('Failed to fetch store apps', e);
        }
      };
      fetchStoreApps();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredApps =
    selectedCategory === 'Discover'
      ? apps
      : apps.filter((app) => app.category.toLowerCase().includes(selectedCategory.toLowerCase()));

  const handleInstallApp = (app: AppStoreItem) => {
    setInstallingId(app.id);
    setTimeout(() => {
      setInstallingId(null);
      alert(`${app.name} installation initiated on your Umbrel container!`);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-5xl h-[85vh] umbrel-glass-dock rounded-3xl border border-slate-700/40 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between py-5 px-8 border-b border-slate-700/40 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xl shadow-lg">
              🏪
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">App Store</h2>
              <p className="text-xs text-slate-400">Discover and install self-hosted applications with one click</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold border border-slate-700/60 transition"
          >
            ✕
          </button>
        </div>

        {/* Category Pills Bar */}
        <div className="flex items-center gap-2 py-4 px-8 border-b border-slate-700/30 overflow-x-auto bg-slate-950/30 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-lg border border-indigo-400/50'
                  : 'bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 border border-slate-700/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Store Apps Grid */}
        <div className="flex-1 p-8 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/20">
          {filteredApps.map((app) => (
            <div
              key={app.id}
              className="umbrel-glass-card p-6 rounded-3xl border border-slate-700/40 flex items-start gap-5 hover:border-indigo-500/40 transition group"
            >
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${app.gradient} border border-white/10 flex items-center justify-center text-3xl shrink-0 shadow-lg group-hover:scale-105 transition-all`}
              >
                {app.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-base font-bold text-slate-100 truncate">{app.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-indigo-300 font-mono border border-slate-700/50">
                    {app.category}
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">{app.description}</p>

                <button
                  onClick={() => handleInstallApp(app)}
                  disabled={installingId === app.id}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {installingId === app.id ? 'Installing...' : 'Get / Install'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
