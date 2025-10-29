import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useClock } from '../../hooks/useClock';
import { DEFAULT_WALLPAPER, useSettingsStore } from '../../stores/settingsStore';

const apps = [
  {
    name: '微信',
    path: '/apps/chat',
    icon: '💬',
    gradient: 'from-emerald-400/80 to-green-500/70'
  },
  {
    name: '设置',
    path: '/apps/settings',
    icon: '⚙️',
    gradient: 'from-slate-200/80 to-slate-100/70'
  }
];

const DesktopView = () => {
  const { time, date, weekday } = useClock();
  const wallpaperSetting = useSettingsStore((state) => state.wallpaperUrl);
  const wallpaperUrl = wallpaperSetting?.trim() || DEFAULT_WALLPAPER;
  const wallpaperStyle = useMemo(
    () => ({
      backgroundImage: `url(${wallpaperUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }),
    [wallpaperUrl]
  );

  return (
    <div className="relative flex flex-1">
      <div className="absolute inset-0" style={wallpaperStyle} aria-hidden="true" />
      {/* <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" aria-hidden="true" /> */}
      <div className="relative z-10 flex flex-1 flex-col p-6">
        <header className="mb-10 mt-4 flex flex-col items-center text-center text-white">
          <span className="text-6xl font-semibold tracking-tight sm:text-7xl">{time}</span>
          <span className="mt-2 text-lg font-medium text-white/80">
            {date} · {weekday}
          </span>
        </header>

        <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6">
          <div className="grid grid-cols-4 gap-6">
            {apps.map((app) => (
              <Link
                key={app.name}
                to={app.path}
                className="group flex flex-col items-center text-center text-sm text-white/90 transition-transform duration-300 hover:-translate-y-1"
              >
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br ${app.gradient} shadow-lg shadow-black/30 backdrop-blur-xl transition-all duration-300 group-hover:shadow-white/20`}
                >
                  <span className="text-2xl">{app.icon}</span>
                </div>
                <span className="mt-2 font-medium">{app.name}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DesktopView;
