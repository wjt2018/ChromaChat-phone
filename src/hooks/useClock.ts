import { useEffect, useState } from 'react';

const locale = 'zh-CN';

export const useClock = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return {
    time: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString(locale, { month: 'long', day: 'numeric' }),
    weekday: now.toLocaleDateString(locale, { weekday: 'long' })
  };
};
