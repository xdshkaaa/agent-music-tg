import { useEffect, useState } from "react";
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

  // New error: reset state. Error toasts stay up until the user dismisses
  // them or retries — they can carry a decision (Повторить) or admin-only
  // detail, and auto-dismissing risks losing either mid-read.
  useEffect(() => {
    setVisible(true);
    setShowDetail(false);
  }, [message]);

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
