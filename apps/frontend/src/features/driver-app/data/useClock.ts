import { useEffect, useState } from 'react';

function hhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Wall clock for the status bar, "H:mm".
 *
 * Not server data, so it does not belong in `src/data/` conceptually — but it is the
 * same shape of concern (something that changes underneath the UI on its own), and
 * putting it here keeps `DriverAppContext` down to pure navigation state.
 *
 * Ticks on the minute boundary rather than every 60s from mount, so the displayed
 * minute never lags behind the real one.
 */
export function useClock(): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number;

    const schedule = () => {
      const d = new Date();
      setNow(d);
      const msToNextMinute = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      timer = window.setTimeout(schedule, msToNextMinute);
    };

    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  return hhmm(now);
}
