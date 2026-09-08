'use client';

interface DockItem {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
}

interface DesktopDockProps {
  items: DockItem[];
}

export default function DesktopDock({ items }: DesktopDockProps) {
  return (
    <nav
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 umbrel-dock-pill px-3 py-2.5 flex items-center gap-1.5"
      aria-label="Umbrella OS dock"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          title={item.label}
          tabIndex={0}
          className={`launcher-focusable group flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-2xl transition-all duration-200 outline-none ${
            item.active
              ? 'bg-white/15 scale-105'
              : 'hover:bg-white/10 hover:scale-105'
          } focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:scale-110`}
        >
          <span
            className="w-12 h-12 rounded-[1.15rem] umbrel-dock-icon flex items-center justify-center text-2xl shadow-lg"
            aria-hidden
          >
            {item.icon}
          </span>
          <span className="text-[9px] font-semibold text-white/80 tracking-wide opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity absolute -top-5 whitespace-nowrap bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-md pointer-events-none">
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
