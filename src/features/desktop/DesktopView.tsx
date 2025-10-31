import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useClock } from '../../hooks/useClock';
import { DEFAULT_WALLPAPER, useSettingsStore } from '../../stores/settingsStore';

type NavigatorWithExtras = Navigator & {
  getBattery?: () => Promise<BatteryManager>;
  connection?: NetworkInformation;
};

interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number;
  addEventListener(type: 'chargingchange' | 'levelchange', listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: 'chargingchange' | 'levelchange', listener: EventListenerOrEventListenerObject): void;
}

type NetworkInformation = {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  addEventListener?(type: 'change', listener: EventListenerOrEventListenerObject): void;
  removeEventListener?(type: 'change', listener: EventListenerOrEventListenerObject): void;
  onchange?: (() => void) | null;
};

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

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{
    type?: string;
    effectiveType?: string;
    downlink?: number;
  }>({});

  useEffect(() => {
    let mounted = true;
    let batteryManager: BatteryManager | null = null;
    let batteryListener: (() => void) | null = null;
    const nav = navigator as NavigatorWithExtras;

    if (typeof nav.getBattery === 'function') {
      nav
        .getBattery?.()
        .then((manager) => {
          if (!mounted) {
            return;
          }
          batteryManager = manager;
          const updateBattery = () => {
            setBatteryLevel(manager.level);
            setIsCharging(manager.charging);
          };
          batteryListener = updateBattery;
          updateBattery();
          manager.addEventListener('levelchange', updateBattery);
          manager.addEventListener('chargingchange', updateBattery);
        })
        .catch(() => {
          // ignore failures and leave defaults
        });
    }

    return () => {
      mounted = false;
      if (batteryManager && batteryListener) {
        batteryManager.removeEventListener('levelchange', batteryListener);
        batteryManager.removeEventListener('chargingchange', batteryListener);
      }
    };
  }, []);

  useEffect(() => {
    const nav = navigator as NavigatorWithExtras;
    const connection = nav.connection;
    if (!connection) {
      return;
    }

    const updateConnection = () => {
      setNetworkInfo({
        type: connection.type,
        effectiveType: connection.effectiveType,
        downlink: connection.downlink
      });
    };

    updateConnection();

    if (typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', updateConnection);
      return () => connection.removeEventListener?.('change', updateConnection);
    }

    const originalHandler = connection.onchange;
    connection.onchange = updateConnection;
    return () => {
      connection.onchange = originalHandler ?? null;
    };
  }, []);

  const batteryPercent =
    batteryLevel !== null ? Math.round(batteryLevel * 100) : null;
  const effectiveType = networkInfo.effectiveType ?? 'unknown';

  const signalBars = (() => {
    switch (effectiveType) {
      case 'slow-2g':
        return 1;
      case '2g':
        return 2;
      case '3g':
        return 3;
      case '4g':
      case '5g':
        return 4;
      default:
        return networkInfo.type === 'wifi' ? 4 : 2;
    }
  })();
  const isWifi = (networkInfo.type ?? '').toLowerCase() === 'wifi';
  const connectionBadge = isWifi
    ? null
    : (networkInfo.effectiveType ?? networkInfo.type ?? 'N/A').toUpperCase();
  const wifiStrength = (() => {
    if (!isWifi) {
      return 0;
    }
    if (typeof networkInfo.downlink === 'number') {
      if (networkInfo.downlink >= 30) {
        return 3;
      }
      if (networkInfo.downlink >= 10) {
        return 2;
      }
      if (networkInfo.downlink > 0) {
        return 1;
      }
      return 0;
    }
    return Math.min(3, Math.max(0, signalBars - 1));
  })();
  const batteryFillWidth =
    batteryPercent !== null ? Math.min(100, Math.max(8, batteryPercent)) : 50;
  const batteryFillColor =
    batteryPercent !== null && batteryPercent < 20 && !isCharging ? '#ef4444' : '#0f172a';

  return (
    <div className="relative flex flex-1">
      <div className="absolute inset-0" style={wallpaperStyle} aria-hidden="true" />
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden="true" />
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="mb-8 flex items-center justify-between bg-white/55 px-4 py-1 text-[11px] font-semibold text-slate-900 shadow-md shadow-black/20">
          <span className="text-sm font-semibold">{time}</span>
          <div className="flex items-center gap-3">
            <div className="flex items-end gap-[2px]">
              {[1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={`w-[3px] rounded-[1px] ${signalBars >= level ? 'bg-slate-900' : 'bg-slate-400'}`}
                  style={{ height: `${5 + level * 3}px` }}
                />
              ))}
            </div>
            {isWifi ? (
              <svg className="h-4 w-4 text-slate-900" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4.24 8.76a13 13 0 0 1 15.52 0"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  opacity={wifiStrength >= 3 ? 1 : 0.25}
                />
                <path
                  d="M7.5 12a8.5 8.5 0 0 1 9 0"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  opacity={wifiStrength >= 2 ? 1 : 0.25}
                />
                <path
                  d="M10.8 15.1a4 4 0 0 1 2.4 0"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  opacity={wifiStrength >= 1 ? 1 : 0.25}
                />
                <circle cx="12" cy="18" r="1.1" fill="currentColor" />
              </svg>
            ) : (
              <span className="rounded-md border border-slate-400 px-1 py-[1px] text-[10px] font-bold">
                {connectionBadge ?? 'N/A'}
              </span>
            )}
            <div className="flex items-center gap-[3px]">
              <div className="relative flex h-3.5 w-6 items-center rounded-[4px] border border-slate-900/80">
                <div
                  className="ml-[1px] h-[70%] rounded-[2px] transition-all"
                  style={{
                    width: `${batteryFillWidth}%`,
                    backgroundColor: batteryFillColor
                  }}
                />
              </div>
              <div className="h-[6px] w-[2px] rounded-sm bg-slate-900" />
            </div>
            {batteryPercent !== null ? (
              <span className="text-[10px] font-medium">
                {batteryPercent}%
                {isCharging ? '⚡' : ''}
              </span>
            ) : null}
          </div>
        </div>

        <header className="mb-10 mt-4 flex flex-col items-center text-center text-white">
          <span className="text-6xl font-semibold tracking-tight sm:text-7xl">{time}</span>
          <span className="mt-2 text-lg font-medium text-white/80">
            {date} · {weekday}
          </span>
        </header>

        <section className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6" style={{padding: '0 1.5rem 1.5rem'}}>
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
