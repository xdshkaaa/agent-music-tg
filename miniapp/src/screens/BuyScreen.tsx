import { useEffect, useMemo, useRef, useState } from "react";
import { CaretRight, CircleNotch, MagnifyingGlass, Check, CreditCard, Gift, Star } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { IconOrEmoji } from "../components/IconOrEmoji";
import { TrackSkeleton } from "../components/TrackSkeleton";
import { api, type Offer, type Invoice, type PaymentMethod, type TrialStatus } from "../lib/api";
import { openPayUrl, openStarsInvoice } from "../lib/telegram";

type CategoryFilter = "all" | "credits" | "subscription";
const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "credits", label: "Генерации" },
  { id: "subscription", label: "Подписка" },
];

function grantLabel(o: Offer): string {
  return o.grantKind === "subscription" ? `${o.grantAmount} дн. подписки` : `${o.grantAmount} генераций`;
}

function formatPrice(amount: string, asset: string): string {
  return `${parseFloat(amount)} ${asset}`;
}

export default function BuyScreen({ reason, isAdmin = false }: { reason?: string; isAdmin?: boolean }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [paidInvoices, setPaidInvoices] = useState<Invoice[]>([]);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [showSuccess, setShowSuccess] = useState(false);
  const [trialSuccess, setTrialSuccess] = useState(false);

  // null until the first fetch lands, so pre-existing purchases
  // don't fire the "payment received" toast on mount.
  const prevCountRef = useRef<number | null>(null);

  const refresh = () =>
    Promise.all([api.offers(), api.purchases(), api.me()])
      .then(([o, p, me]) => {
        setOffers(o.offers);
        setTrial(me.trial);
        const paid = p.purchases.filter((i) => i.status === "paid");
        setPaidInvoices(paid);
        if (prevCountRef.current !== null && paid.length > prevCountRef.current) {
          setShowSuccess(true);
          window.setTimeout(() => setShowSuccess(false), 2500);
          // Purchase landed — refresh the header wallet chip without a reload.
          window.dispatchEvent(new CustomEvent("balance-changed"));
        }
        prevCountRef.current = paid.length;
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    return (offers ?? []).filter((o) => category === "all" || o.grantKind === category);
  }, [offers, category]);

  async function buy(offerId: number, method: PaymentMethod = "crypto") {
    setBusyId(offerId);
    setError(null);
    try {
      const result = await api.createInvoice(offerId, method);
      if (!result.payUrl) return;
      if (method === "stars") {
        openStarsInvoice(result.payUrl, (status) => {
          if (status !== "paid") return;
          // Fulfillment lands via the bot's successful_payment handler a moment
          // after the sheet closes — retry so history/balance catch the grant.
          void refresh();
          window.setTimeout(() => void refresh(), 1500);
          window.setTimeout(() => void refresh(), 4000);
        });
      } else {
        openPayUrl(result.payUrl);
        // Crypto payment happens outside the app (bot chat / browser); poll
        // for the webhook-driven grant so balance/history catch up without
        // requiring the user to manually leave and re-enter the screen.
        window.setTimeout(() => void refresh(), 3000);
        window.setTimeout(() => void refresh(), 8000);
        window.setTimeout(() => void refresh(), 15000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function claimTrial() {
    setTrialBusy(true);
    setError(null);
    try {
      const result = await api.claimTrial();
      setTrial(result.trial);
      setTrialSuccess(true);
      void refresh();
      window.setTimeout(() => setTrialSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void refresh();
    } finally {
      setTrialBusy(false);
    }
  }

  if (error && !offers) return <ErrorBanner message={error} onClose={() => setError(null)} onRetry={refresh} isAdmin={isAdmin} />;

  return (
    <div className="stack">
      {reason && (
        <GlassPanel role="status"><CreditCard size={18} weight="bold" /> {reason}</GlassPanel>
      )}

      {showSuccess && (
        <div className="status-card status-card--success" role="status">
          <span className="status-icon status-icon--success">
            <Check size={20} weight="bold" />
          </span>
          <span>Платёж получен, доступ активирован.</span>
        </div>
      )}

      {trialSuccess && (
        <GlassPanel role="status"><Gift size={18} weight="bold" /> Бесплатный пакет активирован: 10 генераций на 3 дня.</GlassPanel>
      )}

      {trial && !trial.claimed && (
        <GlassPanel className="reveal" tone="tinted">
          <div className="trial-card-row">
            <span className="trial-card-info">
              <span className="trial-card-title" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Gift size={18} weight="bold" /> Бесплатный пакет</span>
              <span className="trial-card-label">
                10 генераций на 3 дня
              </span>
            </span>
            <button
              type="button"
              className="glass-button primary"
              disabled={trialBusy}
              onClick={() => void claimTrial()}
              style={{ padding: "10px 14px", fontWeight: 700, fontSize: 14, flexShrink: 0 }}
            >
              Забрать бесплатно
            </button>
          </div>
        </GlassPanel>
      )}

      <GlassPanel className="reveal">
        <div className="category-pills">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`glass-button${category === c.id ? " primary" : ""}`}
              onClick={() => setCategory(c.id)}
              style={{ padding: "8px 14px", fontSize: 13, flex: "0 0 auto" }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="reveal">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} isAdmin={isAdmin} />}
        {offers === null ? (
          <TrackSkeleton rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState icon={<MagnifyingGlass size={40} weight="bold" />} label="ничего не найдено" />
        ) : (
          <div className="stack">
            {visible.map((o) => (
              <div className="offer-row" key={o.id}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                  <span className="offer-icon" aria-hidden="true">
                    <IconOrEmoji icon={o.icon} size={22} />
                  </span>
                  <span className="offer-info">
                    <span className="offer-title">{o.title}</span>
                    <span className="offer-label">{grantLabel(o)}</span>
                  </span>
                </span>
                <span className="offer-price-wrap">
                  <button
                    type="button"
                    className="glass-button offer-price-btn"
                    disabled={busyId === o.id}
                    onClick={() => buy(o.id, "crypto")}
                  >
                    {busyId === o.id ? (
                      <CircleNotch size={16} weight="bold" className="spin" />
                    ) : (
                      <>
                        {formatPrice(o.amount, o.asset)}
                        {!o.starsAmount && <CaretRight size={16} weight="bold" />}
                      </>
                    )}
                  </button>
                  {o.starsAmount && (
                    <button
                      type="button"
                      className="glass-button primary offer-stars-btn"
                      disabled={busyId === o.id}
                      onClick={() => buy(o.id, "stars")}
                    >
                      {busyId === o.id ? (
                        <CircleNotch size={14} weight="bold" className="spin" />
                      ) : (
                        <>
                          {o.starsAmount} <Star size={14} weight="fill" />
                        </>
                      )}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {paidInvoices.length > 0 && (
        <GlassPanel className="reveal">
          <ul className="plain-list">
            {paidInvoices.map((p) => (
              <li key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
                #{p.id}: {p.amount} {p.asset === "XTR" ? <Star size={14} weight="fill" /> : p.asset}
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  );
}
