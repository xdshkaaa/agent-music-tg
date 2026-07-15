import { useEffect, useRef, useState } from "react";
import { X, WarningCircle, ArrowsClockwise, CaretDown } from "@phosphor-icons/react";
import { humanizeError } from "../lib/errorText";

export function ErrorBanner({
  message,
  onClose,
  onRetry,
  isAdmin = false,
}: {
  message: string;
  onClose: () => void;
  onRetry?: () => void;
  /** When true, reveals the technical "Подробнее" disclosure. */
  isAdmin?: boolean;
}) {
  const friendly = humanizeError(message);
  const [visible, setVisible] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function armTimer() {
    clearTimer();
    // Errors with a retry action need a decision from the user — don't let
    // the action silently vanish while they're still reading it.
    if (onRetry) return;
    timer.current = setTimeout(() => {
      setVisible(false);
      onClose();
    }, 10000);
  }

  // New error: reset state and (re)arm auto-dismiss.
  useEffect(() => {
    setVisible(true);
    setShowDetail(false);
    armTimer();
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, onClose, onRetry]);

  // While details are open, don't auto-dismiss; re-arm when collapsed.
  useEffect(() => {
    if (showDetail) clearTimer();
    else armTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetail]);

  if (!visible) return null;

  return (
    <div className="error-toast" role="alert">
      <div className="error-toast-main">
        <WarningCircle size={18} weight="bold" className="error-toast-icon" aria-hidden="true" />
        <p className="error-toast-text">{friendly.message}</p>
        <button
          type="button"
          className="error-toast-close"
          aria-label="Закрыть"
          onClick={() => {
            clearTimer();
            setVisible(false);
            onClose();
          }}
        >
          <X size={16} />
        </button>
      </div>

      {(onRetry || (isAdmin && friendly.detail)) && (
        <div className="error-toast-actions">
          {onRetry && (
            <button type="button" className="error-toast-action" onClick={onRetry}>
              <ArrowsClockwise size={14} weight="bold" /> Повторить
            </button>
          )}
          {isAdmin && friendly.detail && (
            <button
              type="button"
              className="error-toast-action"
              aria-expanded={showDetail}
              onClick={() => setShowDetail((v) => !v)}
            >
              <CaretDown size={14} weight="bold" className={showDetail ? "error-toast-caret-open" : ""} /> Подробнее
            </button>
          )}
        </div>
      )}

      {showDetail && isAdmin && friendly.detail && <pre className="error-toast-detail">{friendly.detail}</pre>}
    </div>
  );
}
