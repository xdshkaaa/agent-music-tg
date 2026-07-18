import { useEffect, useState } from "react";
import {
  Package, Plus, Wallet, Calendar, Receipt, User,
  CircleNotch, WarningCircle, Gift, Star,
  MusicNotes,
  ChartBar,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { getTelegramUserFirstName } from "../lib/telegram";
import { api, type MeResponse, type Invoice } from "../lib/api";
import { ACCENT_PRESETS } from "../lib/accent";

function formatSubscription(until: number | null): string {
  if (!until) return "нет";
  if (until * 1000 <= Date.now()) return "истекла";
  return new Date(until * 1000).toLocaleDateString("ru-RU");
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
    <div className="admin-settings-bar-item">
      <span className="admin-settings-bar-label icon-row">
        <MusicNotes size={13} weight="bold" /> Музыка
      </span>
      <Segmented<MusicBackendId>
        ariaLabel="Источник музыки"
        role="radiogroup"
        fill
        options={MUSIC_BACKENDS}
        labels={MUSIC_BACKEND_LABELS}
        value={backend}
        onChange={handleChange}
      />
      <span
        role="status"
        aria-label={saving ? "Сохранение" : undefined}
        style={{ display: "inline-flex", width: 14, height: 14, marginLeft: 8, flexShrink: 0 }}
      >
        {saving && <CircleNotch size={14} className="spin" />}
      </span>
      {saveError && (
        <p role="alert" className="text-muted fs-micro" style={{ margin: "6px 0 0", width: "100%" }}>
          Не удалось сохранить, попробуйте ещё раз
        </p>
      )}
    </div>
  );
}

function AccentPicker({ accent, onChange }: { accent: string; onChange: (value: string) => void }) {
  return (
    <div style={{ marginTop: 14, padding: "14px 0 0", borderTop: "1px solid var(--hairline)" }}>
      <span className="text-muted fs-micro" style={{ display: "block", marginBottom: 10 }}>
        Акцентный цвет
      </span>
      <div role="radiogroup" aria-label="Акцентный цвет" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.purchases()
      .then((p) => setPurchases(p.purchases.filter((i) => i.status === "paid")))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="stack">
      <GlassPanel className="reveal">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          {me?.photoUrl ? (
            <img src={me.photoUrl} alt="" className="profile-avatar" />
          ) : (
            <span className="profile-avatar-placeholder" aria-hidden="true">
              <User size={20} weight="bold" style={{ color: "var(--text-muted-dark)" }} />
            </span>
          )}
          <div>
            <p className="fs-title" style={{ fontWeight: 800, margin: 0 }}>
              {firstName ?? displayName(me)}
            </p>
            {firstName && me?.username && (
              <p className="text-muted fs-label" style={{ margin: "2px 0 0" }}>@{me.username}</p>
            )}
          </div>
        </div>

        <div className="profile-stats">
          <div className="stack" style={{ gap: 4 }}>
            <span className="text-muted icon-row fs-micro">
              <Wallet size={13} weight="bold" /> Баланс
            </span>
            <span style={{ fontSize: 38, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "var(--ls-display)", lineHeight: 1.05 }}>
              {me?.credits ?? 0} <span style={{ fontSize: 18, fontWeight: 700 }}>ген</span>
            </span>
            {me?.trial.active && (
              <span className="text-muted fs-micro" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Gift size={12} weight="bold" /> {me.trial.creditsLeft} ген. до{" "}
                {new Date((me.trial.until ?? 0) * 1000).toLocaleDateString("ru-RU")}
              </span>
            )}
            <span className="text-muted icon-row fs-micro">
              <ChartBar size={13} weight="bold" /> Потрачено: {me?.generationsUsed ?? 0} ген
            </span>
            <span className="text-muted icon-row fs-micro">
              <Calendar size={13} weight="bold" /> Подписка: {formatSubscription(me?.subscriptionUntil ?? null)}
            </span>
          </div>
          <button type="button" className="glass-button primary profile-topup-btn" onClick={onGoShop}>
            <Plus size={18} weight="bold" />
            Пополнить
          </button>
        </div>

        <div className="admin-settings-bar" style={{ marginTop: 14, padding: "14px 0 0" }}>
          <MusicBackendPicker me={me} />
        </div>

        <AccentPicker accent={accent} onChange={onChangeAccent} />
      </GlassPanel>

      <GlassPanel className="reveal">
        <h2 className="screen-title" style={{ marginBottom: 14 }}>Покупки</h2>
        {error && <p role="alert" className="icon-row"><WarningCircle size={16} weight="bold" /> {error}</p>}
        {purchases.length === 0 ? (
          <EmptyState
            icon={<Package size={40} weight="bold" />}
            label="Покупок пока нет"
            action={{ label: "В магазин", onClick: onGoShop }}
          />
        ) : (
          <ul className="plain-list plain-list--col-gap reveal-stagger">
            {purchases.map((p, i) => (
              <li key={p.id} className="purchase-item" style={{ ["--i" as string]: i }}>
                <Receipt size={18} weight="bold" />
                <span style={{ flex: 1 }}>
                  #{p.id} · {p.amount} {p.asset === "XTR" ? <Star size={12} weight="fill" /> : p.asset}
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
