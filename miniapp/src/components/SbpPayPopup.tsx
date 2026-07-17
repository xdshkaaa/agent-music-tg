import { useEffect, useRef, useState } from "react";
import { X, Bank, ArrowSquareOut } from "@phosphor-icons/react";
import { openPayUrl, openSupport } from "../lib/telegram";

interface SbpPayPopupProps {
  payUrl: string;
  offerTitle: string;
  supportContact: string;
  onClose: (cancelled: boolean) => void;
}

/**
 * СБП payment sheet. Sits just above the bottom dock (z-index above the dock)
 * so the user can read it without the nav covering it. Tapping the backdrop or
 * «Закрыть» rolls the held credits back via onClose(true); the successful
 * completion path is handled by the parent polling the purchase list.
 */
export function SbpPayPopup({ payUrl, offerTitle, supportContact, onClose }: SbpPayPopupProps) {
  const [, setOpened] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePay() {
    setOpened(true);
    openPayUrl(payUrl);
  }

  return (
    <div
      className="sbp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Оплата через СБП"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(true);
      }}
    >
      <div className="sbp-sheet" ref={cardRef}>
        <div className="sbp-sheet-head">
          <span className="sbp-sheet-title">
            <Bank size={18} weight="bold" aria-hidden="true" /> Оплата через СБП
          </span>
          <button
            type="button"
            className="sbp-close"
            aria-label="Закрыть"
            onClick={() => onClose(true)}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="sbp-sheet-body">
          Нажмите на оплатить чтобы получить <strong>{offerTitle}</strong> через оплату СБП.
          После оплаты доступ к подписке/генерациям появится автоматически.
        </p>

        <a
          className="glass-button primary sbp-pay-btn"
          href={payUrl}
          onClick={(e) => {
            e.preventDefault();
            handlePay();
          }}
        >
          <ArrowSquareOut size={16} weight="bold" aria-hidden="true" /> Оплатить
        </a>
        {supportContact && (
          <button
            type="button"
            className="sbp-support"
            onClick={() => openSupport(supportContact)}
          >
            Нужна помощь?
          </button>
        )}
      </div>
    </div>
  );
}
