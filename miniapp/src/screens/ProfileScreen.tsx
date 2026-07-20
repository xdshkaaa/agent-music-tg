import { useCallback, useEffect, useState } from "react";
import {
  Package, Plus, Wallet, Calendar, Receipt, User,
  CircleNotch, WarningCircle, Gift,
  MusicNotes,
  ChartBar,
  UsersThree, Copy, Check,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { getTelegramUserFirstName, getTelegramWebApp } from "../lib/telegram";
import { api, type MeResponse, type Invoice } from "../lib/api";
import { ACCENT_PRESETS } from "../lib/accent";

function formatSubscription(until: number | null): string {
  if (!until) return "Не подключена";
  if (until * 1000 <= Date.now()) return "Истекла";
  return `До ${new Date(until * 1000).toLocaleDateString("ru-RU")}`;
}

function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const absolute = Math.abs(n);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function generationWord(n: number): string {
  return pluralRu(n, ["генерация", "генерации", "генераций"]);
}

function formatGenerationCount(n: number): string {
  return `${n} ${generationWord(n)}`;
}

function formatPurchaseAmount(invoice: Invoice): string {
  return invoice.asset === "XTR"
    ? `${invoice.amount} звёзд Telegram`
    : `${invoice.amount} ${invoice.asset}`;
}

function displayName(me: MeResponse | null): string {
  if (!me) return "—";
  if (me.username) return `@${me.username}`;
  return `ID ${me.chatId}`;
}

const MUSIC_BACKENDS = ["youtube-music", "soundcloud"] as const;
type MusicBackendId = (typeof MUSIC_BACKENDS)[number];
const MUSIC_BACKEND_LABELS: Record<MusicBackendId, string> = {
  "youtube-music": "YouTube Music",
  soundcloud: "SoundCloud",
};

function MusicBackendPicker({ me }: { me: MeResponse | null }) {
  const [backend, setBackend] = useState<MusicBackendId>(
    (me?.musicBackend as MusicBackendId | null) ?? "youtube-music",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (me?.musicBackend) setBackend(me.musicBackend as MusicBackendId);
  }, [me?.musicBackend]);

  async function handleChange(id: MusicBackendId) {
    const previous = backend;
    setBackend(id);
    setSaving(true);
    setSaveError(false);
    try {
      await api.setMyMusicBackend(id);
    } catch {
      setBackend(previous);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-preference">
      <div className="profile-preference-heading">
        <span className="profile-section-label icon-row">
          <MusicNotes size={14} weight="bold" /> Источник треков
        </span>
        {saving && (
          <span role="status" aria-label="Сохраняем источник треков" className="profile-saving-indicator">
            <CircleNotch size={14} className="spin" />
          </span>
        )}
      </div>
      <Segmented<MusicBackendId>
        ariaLabel="Источник треков"
        role="radiogroup"
        fill
        options={MUSIC_BACKENDS}
        labels={MUSIC_BACKEND_LABELS}
        value={backend}
        onChange={handleChange}
      />
      {saveError && (
        <p role="alert" className="text-muted fs-micro profile-preference-error">
          Не удалось сменить источник. Попробуйте ещё раз.
        </p>
      )}
    </div>
  );
}

function AccentPicker({ accent, onChange }: { accent: string; onChange: (value: string) => void }) {
  return (
    <div className="profile-preference profile-accent-picker">
      <span className="profile-section-label">
        Цвет интерфейса
      </span>
      <div role="radiogroup" aria-label="Цвет интерфейса" className="profile-accent-options">
        {ACCENT_PRESETS.map((preset) => {
          const active = preset.value.toLowerCase() === accent.toLowerCase();
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={preset.label}
              onClick={() => onChange(preset.value)}
              className="accent-swatch"
              style={{
                ["--swatch-color" as string]: preset.value,
                outline: active ? "2px solid var(--text-dark, currentColor)" : "none",
                outlineOffset: 2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReferralCard() {
  const [data, setData] = useState<{
    link: string;
    invitedCount: number;
    creditsEarned: number;
    rewardCredits: number;
    maxPerUser: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [error, setError] = useState(false);

  const loadReferral = useCallback(async () => {
    setError(false);
    try {
      setData(await api.referral());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void loadReferral();
  }, [loadReferral]);

  async function handleCopy() {
    if (!data) return;
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
    }
  }

  function handleShare() {
    if (!data) return;
    const webApp = getTelegramWebApp();
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(data.link)}`;
    if (webApp) webApp.openTelegramLink(shareUrl);
    else window.open(shareUrl, "_blank");
  }

  if (error) {
    return (
      <GlassPanel className="reveal">
        <h2 className="screen-title" style={{ marginBottom: 14 }}>Приглашения</h2>
        <EmptyState
          icon={<WarningCircle size={40} weight="bold" />}
          label="Не удалось загрузить приглашения. Проверьте соединение и попробуйте ещё раз."
          action={{ label: "Попробовать снова", onClick: () => void loadReferral() }}
        />
      </GlassPanel>
    );
  }

  if (!data) return null;

  const referralsLeft = data.maxPerUser > 0
    ? Math.max(data.maxPerUser - data.invitedCount, 0)
    : null;
  const rewardDescription = data.rewardCredits === 0
    ? "Поделитесь ссылкой, чтобы друг сразу открыл бота."
    : referralsLeft === 0
      ? "Лимит приглашений с наградой достигнут. Ссылкой всё ещё можно делиться."
      : `За каждого друга, который впервые запустит бота по ссылке, вы получите ${formatGenerationCount(data.rewardCredits)}.${
        referralsLeft === null
          ? ""
          : ` Награда доступна ещё за ${referralsLeft} ${pluralRu(referralsLeft, ["друга", "друзей", "друзей"])}.`
      }`;

  return (
    <GlassPanel className="reveal">
      <h2 className="screen-title" style={{ marginBottom: 6 }}>Приглашайте друзей</h2>
      <p className="text-muted fs-label" style={{ margin: "0 0 14px" }}>{rewardDescription}</p>
      <div className="profile-stats profile-stats--referral">
        <div className="profile-stats-col">
          <span className="text-muted icon-row fs-micro">
            <UsersThree size={13} weight="bold" /> Приглашено друзей
          </span>
          <span className="fs-label" style={{ fontWeight: 700 }}>{data.invitedCount}</span>
        </div>
        <div className="profile-stats-col">
          <span className="text-muted icon-row fs-micro">
            <Gift size={13} weight="bold" /> Получено
          </span>
          <span className="fs-label" style={{ fontWeight: 700 }}>{formatGenerationCount(data.creditsEarned)}</span>
        </div>
      </div>
      <div className="referral-actions">
        <button type="button" className="glass-button" onClick={handleCopy}>
          {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
        <button type="button" className="glass-button primary" onClick={handleShare}>
          <UsersThree size={16} weight="bold" />
          Пригласить друга
        </button>
      </div>
      {copyError && (
        <p role="alert" className="text-muted fs-micro" style={{ margin: "10px 0 0" }}>
          Не удалось скопировать ссылку. Попробуйте ещё раз.
        </p>
      )}
    </GlassPanel>
  );
}

export default function ProfileScreen({
  me,
  onGoShop,
  accent,
  onChangeAccent,
}: {
  me: MeResponse | null;
  onGoShop: () => void;
  accent: string;
  onChangeAccent: (value: string) => void;
}) {
  const firstName = getTelegramUserFirstName();
  const [purchases, setPurchases] = useState<Invoice[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState(false);

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    setPurchasesError(false);
    try {
      const response = await api.purchases();
      setPurchases(response.purchases.filter((invoice) => invoice.status === "paid"));
    } catch {
      setPurchasesError(true);
    } finally {
      setPurchasesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  const availableGenerations = (me?.credits ?? 0) + (me?.trial.active ? me.trial.creditsLeft : 0);

  return (
    <div className="stack">
      <GlassPanel className="reveal">
        <div className="profile-identity">
          {me?.photoUrl ? (
            <img src={me.photoUrl} alt="" className="profile-avatar" />
          ) : (
            <span className="profile-avatar-placeholder" aria-hidden="true">
              <User size={20} weight="bold" style={{ color: "var(--text-muted-dark)" }} />
            </span>
          )}
          <div className="profile-identity-copy">
            <p className="profile-name">{firstName ?? displayName(me)}</p>
            {firstName && me?.username && (
              <p className="text-muted fs-label profile-handle">@{me.username}</p>
            )}
          </div>
        </div>

        <div className="profile-account">
          <div className="profile-balance-row">
            <div className="profile-balance-copy">
              <span className="profile-section-label icon-row">
                <Wallet size={14} weight="bold" /> Доступно
              </span>
              <strong className="profile-balance-value">{formatGenerationCount(availableGenerations)}</strong>
            </div>
            <button type="button" className="glass-button primary profile-topup-btn" onClick={onGoShop}>
              <Plus size={18} weight="bold" />
              Пополнить
            </button>
          </div>

          {me?.trial.active && (
            <p className="text-muted fs-micro profile-trial-note">
              <Gift size={14} weight="bold" />
              <span>
                Пробный баланс: {formatGenerationCount(me.trial.creditsLeft)}, до{" "}
                {new Date((me.trial.until ?? 0) * 1000).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
              </span>
            </p>
          )}

          <div className="profile-facts">
            <div className="profile-fact">
              <span className="text-muted icon-row fs-micro">
                <ChartBar size={13} weight="bold" /> Использовано
              </span>
              <span className="fs-label profile-fact-value">{formatGenerationCount(me?.generationsUsed ?? 0)}</span>
            </div>
            <div className="profile-fact">
              <span className="text-muted icon-row fs-micro">
                <Calendar size={13} weight="bold" /> Подписка
              </span>
              <span className="fs-label profile-fact-value">{formatSubscription(me?.subscriptionUntil ?? null)}</span>
            </div>
          </div>
        </div>

        <div className="profile-preferences">
          <MusicBackendPicker me={me} />
          <AccentPicker accent={accent} onChange={onChangeAccent} />
        </div>
      </GlassPanel>

      <ReferralCard />

      <GlassPanel className="reveal">
        <h2 className="screen-title" style={{ marginBottom: 14 }}>История покупок</h2>
        {purchasesLoading ? (
          <p role="status" className="text-muted icon-row">
            <CircleNotch size={16} className="spin" /> Загружаем покупки…
          </p>
        ) : purchasesError ? (
          <div role="alert">
            <p className="icon-row">
              <WarningCircle size={16} weight="bold" />
              Не удалось загрузить покупки. Проверьте соединение и попробуйте ещё раз.
            </p>
            <button type="button" className="glass-button" onClick={() => void loadPurchases()}>
              Попробовать снова
            </button>
          </div>
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={<Package size={40} weight="bold" />}
            label="Здесь появятся оплаченные пакеты и подписки."
            action={{ label: "Выбрать пакет", onClick: onGoShop }}
          />
        ) : (
          <ul className="plain-list plain-list--col-gap reveal-stagger">
            {purchases.map((p, i) => (
              <li key={p.id} className="purchase-item" style={{ ["--i" as string]: i }}>
                <Receipt size={18} weight="bold" />
                <span style={{ flex: 1 }}>
                  Покупка №{p.id} · {formatPurchaseAmount(p)}
                </span>
                <time
                  dateTime={new Date(p.createdAt * 1000).toISOString()}
                  className="text-muted"
                  style={{ fontSize: 12 }}
                >
                  {new Date(p.createdAt * 1000).toLocaleDateString("ru-RU")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
