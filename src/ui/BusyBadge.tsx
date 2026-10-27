import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store.ts';

const TICK_MS = 100;

/**
 * Tells that a rebuild is running and that it is still moving: the seconds
 * count up, and generators that build piece by piece show how many pieces
 * are done, with a bar underneath.
 */
export function BusyBadge() {
  const busy = useAppStore((state) => state.busy);
  const busySince = useAppStore((state) => state.busySince);
  const progress = useAppStore((state) => state.progress);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [busy]);
  if (!busy) {
    return null;
  }
  const seconds = Math.max(0, now - (busySince ?? now)) / 1000;
  const share = progress === null ? 0 : progress.done / progress.total;
  return (
    <div className="busy-badge" role="status">
      <span className="busy-text">
        Rebuilding
        {progress !== null && `, ${progress.done} of ${progress.total} ${progress.pieces}`}
      </span>
      <span className="busy-seconds">{seconds.toFixed(1)} s</span>
      <div className="busy-bar">
        <div className="busy-bar-fill" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
