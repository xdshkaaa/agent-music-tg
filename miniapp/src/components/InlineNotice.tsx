import { useState } from "react";
import { WarningCircle, X, Lifebuoy } from "@phosphor-icons/react";
import { humanizeError } from "../lib/errorText";

export function InlineNotice({
  message,
  onDismiss,
  onOtherOption,
  onSupport,
  supportContact,
  isAdmin = false,
}: {
  /** Raw error string (will be humanized). */
  message: string;
  onDismiss: () => void;
  /** Clears the notice and points the user at other payment options. */
  onOtherOption?: () => void;
  /** Opens the support contact. */
  onSupport?: () => void;
  /** Contact string for support; when empty the support action is hidden. */
  supportContact?: string;
  isAdmin?: boolean;
}) {
  const friendly = humanizeError(message);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="inline-notice" role="alert">
      <button type="button" className="inline-notice-close" aria-label="Закрыть" onClick={onDismiss}>
        <X size={14} />
      </button>
      <div className="inline-notice-main">
        <WarningCircle size={18} weight="bold" className="inline-notice-icon" aria-hidden="true" />
        <div className="inline-notice-body">
          {friendly.title && <p className="inline-notice-title">{friendly.title}</p>}
          <p className="inline-notice-text">{friendly.message}</p>
          {(onOtherOption || (onSupport && supportContact)) && (
            <div className="inline-notice-actions">
              {onOtherOption && (
                <button type="button" className="inline-notice-action primary" onClick={onOtherOption}>
                  Другой способ
                </button>
              )}
              {onSupport && supportContact && (
                <button type="button" className="inline-notice-action" onClick={onSupport}>
                  <Lifebuoy size={13} weight="bold" /> Поддержка
                </button>
              )}
            </div>
          )}
          {isAdmin && friendly.detail && (
            <button
              type="button"
              className="inline-notice-more"
              aria-expanded={showDetail}
              onClick={() => setShowDetail((v) => !v)}
            >
              {showDetail ? "Скрыть" : "Подробнее"}
            </button>
          )}
          {showDetail && isAdmin && friendly.detail && <pre className="inline-notice-detail">{friendly.detail}</pre>}
        </div>
      </div>
    </div>
  );
}
