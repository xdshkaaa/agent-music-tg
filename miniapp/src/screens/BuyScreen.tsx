import { useEffect, useMemo, useRef, useState } from "react";
import { CircleNotch, MagnifyingGlass, Check, CreditCard, Gift, Star } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { InlineNotice } from "../components/InlineNotice";
import { IconOrEmoji } from "../components/IconOrEmoji";
import { TrackSkeleton } from "../components/TrackSkeleton";
import { Segmented } from "../components/Segmented";
import { SbpPayPopup } from "../components/SbpPayPopup";
import { api, type Offer, type Invoice, type PaymentMethod, type TrialStatus } from "../lib/api";
import { openPayUrl, openStarsInvoice, openSupport } from "../lib/telegram";

type CategoryFilter = "all" | "credits" | "subscription";
const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "Все",
  credits: "Генерации",
  subscription: "Подписка",
};
const CATEGORY_OPTIONS: CategoryFilter[] = ["all", "credits", "subscription"];

// Russian plural forms: 1 генерация / 2 генерации / 5 генераций.
function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function grantLabel(o: Offer): string {
  const n = o.grantAmount;
  return o.grantKind === "subscription"
    ? `${n} ${pluralRu(n, ["день", "дня", "дней"])} подписки`
    : `${n} ${pluralRu(n, ["генерация", "генерации", "генераций"])}`;
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
  const [offerErrors, setOfferErrors] = useState<Record<number, string>>({});
  const [supportContact, setSupportContact] = useState<string>("");
  const [sbpInvoice, setSbpInvoice] = useState<{ id: number; payUrl: string; offerTitle: string } | null>(null);

  // null until the first fetch lands, so pre-existing purchases
  // don't fire the "payment received" toast on mount.
  const prevCountRef = useRef<number | null>(null);

  const refresh = () =>
    Promise.all([api.offers(), api.purchases(), api.me(), api.shopConfig()])
      .then(([o, p, me, cfg]) => {
        setOffers(o.offers);
        setSupportContact(cfg.supportContact ?? "");
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

  async function buy(offerId: number, method: PaymentMethod = "stars") {
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
      } else if (method === "platega") {
        // СБП pays in an external bank app; show the sheet above the dock and
        // poll for the webhook-driven grant while it is open.
        setSbpInvoice({ id: result.id, payUrl: result.payUrl, offerTitle: result.offerTitle });
        window.setTimeout(() => void refresh(), 3000);
        window.setTimeout(() => void refresh(), 8000);
        window.setTimeout(() => void refresh(), 15000);
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
      const msg = e instanceof Error ? e.message : String(e);
      setOfferErrors((prev) => ({ ...prev, [offerId]: msg }));
    } finally {
      setBusyId(null);
    }
  }

  function clearOfferError(offerId: number) {
    setOfferErrors((prev) => {
      const next = { ...prev };
      delete next[offerId];
      return next;
    });
  }

  async function handleSbpClose(cancelled: boolean) {
    const inv = sbpInvoice;
    setSbpInvoice(null);
    if (cancelled && inv) {
      // Roll the held credits back if the user bailed before paying.
      try {
        await api.cancelInvoice(inv.id);
      } catch {
        /* ignore — the invoice still expires server-side */
      }
      void refresh();
      window.dispatchEvent(new CustomEvent("balance-changed"));
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
        <GlassPanel className="reveal trial-card" tone="tinted">
          <div className="trial-card-row">
            <span className="trial-card-info">
              <span className="trial-card-title"><Gift size={16} weight="bold" /> Бесплатный пакет</span>
              <span className="trial-card-label">10 генераций на 3 дня</span>
            </span>
            <button
              type="button"
              className="glass-button primary trial-card-btn"
              disabled={trialBusy}
              onClick={() => void claimTrial()}
            >
              Забрать
            </button>
          </div>
        </GlassPanel>
      )}

      <Segmented
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={setCategory}
        labels={CATEGORY_LABELS}
        tinted
        fill
        role="radiogroup"
        ariaLabel="Категория предложений"
      />

      <GlassPanel className="reveal">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} isAdmin={isAdmin} />}
        {offers === null ? (
          <TrackSkeleton rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState icon={<MagnifyingGlass size={40} weight="bold" />} label="В этой категории пока нет предложений" />
        ) : (
          <div className="stack">
            {visible.map((o) => (
              <div className="offer-row" key={o.id}>
                <span className="offer-identity">
                  <IconOrEmoji icon={o.icon} size={22} />
                  <span className="offer-info">
                    <span className="offer-title">{o.title}</span>
                    <span className="offer-label">{grantLabel(o)}</span>
                  </span>
                </span>
                <span className="offer-price-wrap">
                  {o.starsAmount && (
                    <button
                      type="button"
                      className="glass-button primary offer-stars-btn"
                      disabled={busyId === o.id}
                      aria-busy={busyId === o.id}
                      aria-label={`Купить «${o.title}» за ${o.starsAmount} звёзд`}
                      onClick={() => buy(o.id, "stars")}
                    >
                      {busyId === o.id ? (
                        <CircleNotch size={14} weight="bold" className="spin" aria-hidden="true" />
                      ) : (
                        <>
                          {o.starsAmount} <Star size={14} weight="fill" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  )}
                  {o.rubAmount && (
                    <button
                      type="button"
                      className="glass-button offer-rub-btn"
                      disabled={busyId === o.id}
                      aria-busy={busyId === o.id}
                      aria-label={`Купить «${o.title}» за ${o.rubAmount} рублей по СБП`}
                      onClick={() => buy(o.id, "platega")}
                    >
                      {busyId === o.id ? (
                        <CircleNotch size={14} weight="bold" className="spin" aria-hidden="true" />
                      ) : (
                        `${o.rubAmount} ₽ · СБП`
                      )}
                    </button>
                  )}
                </span>
                {offerErrors[o.id] && (
                  <InlineNotice
                    message={offerErrors[o.id]!}
                    onDismiss={() => clearOfferError(o.id)}
                    onOtherOption={() => clearOfferError(o.id)}
                    onSupport={supportContact ? () => openSupport(supportContact) : undefined}
                    supportContact={supportContact}
                    isAdmin={isAdmin}
                  />
                )}
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
                Покупка №{p.id} — {p.amount} {p.asset === "XTR" ? <Star size={14} weight="fill" aria-hidden="true" /> : p.asset}
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}

      {sbpInvoice && (
        <SbpPayPopup
          payUrl={sbpInvoice.payUrl}
          offerTitle={sbpInvoice.offerTitle}
          supportContact={supportContact}
          onClose={handleSbpClose}
        />
      )}
    </div>
  );
}
