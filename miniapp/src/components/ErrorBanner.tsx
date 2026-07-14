import { useEffect, useState, type CSSProperties } from "react";
import { X, WarningCircle } from "@phosphor-icons/react";
import { GlassPanel } from "./GlassPanel";

export function ErrorBanner({
  message,
  onClose,
  onRetry,
}: {
  message: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onClose();
    }, 8000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!visible) return null;

  return (
    <GlassPanel className="stack" role="alert" tone="tinted" style={{ "--glass-tint-color": "#ef4444" } as React.CSSProperties}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ flex: 1 }}><WarningCircle size={16} weight="bold" /> {message}</span>
        <button
          type="button"
          className="action-btn action-btn--neutral"
          aria-label="Закрыть"
          onClick={() => { setVisible(false); onClose(); }}
          style={{ flexShrink: 0, minWidth: 28, minHeight: 28 }}
        >
          <X size={16} />
        </button>
      </div>
      {onRetry && (
        <button type="button" className="glass-button primary" onClick={onRetry} style={{ alignSelf: "flex-start" }}>
          Повторить
        </button>
      )}
    </GlassPanel>
  );
}
