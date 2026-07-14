import { useEffect, useState } from "react";

const SHOW_DELAY = 200;
const MIN_DURATION = 400;

export function TrackSkeleton({ rows = 5 }: { rows?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), SHOW_DELAY);
    return () => {
      clearTimeout(showTimer);
      setVisible(false);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = setTimeout(() => {}, MIN_DURATION);
    return () => clearTimeout(hideTimer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-box" style={{ width: 44, height: 44 }} />
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <div className="skeleton-box" style={{ width: `${70 - i * 6}%`, height: 12 }} />
            <div className="skeleton-box" style={{ width: `${45 - i * 4}%`, height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
