import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  WarningCircle, Circle, Key, XCircle, Plus, Minus, Star,
  Calendar, Prohibit, Crown, User, PencilSimple, Paperclip, X,
  Gauge, UsersThree, Storefront, SlidersHorizontal, PaperPlaneTilt,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { AdminSettingsBar } from "../components/AdminSettingsBar";
import { Segmented } from "../components/Segmented";
import type {
  AdminSettings,
  AdminStats,
  AdminUser,
  AllowlistEntry,
  Offer,
  OfferInput,
  GrantKind,
  ShopSettings,
  ProviderConfigEntry,
  SettingEntry,
  PaymentsConfig,
  StatsPeriod,
  AdminBroadcastButton,
  AdminBroadcastButtonPreset,
  AdminBroadcastButtonStyle,
} from "../lib/api";
import { api } from "../lib/api";
import { buildTelegramUtmLink, buildTelegramUtmPayload, TELEGRAM_START_PARAM_LIMIT } from "../lib/utm";

type AdminTab = "overview" | "audience" | "commerce" | "system" | "broadcast";

const SETTINGS_TABS: AdminTab[] = ["overview", "audience", "commerce", "system", "broadcast"];
const SETTINGS_LABELS: Record<AdminTab, string> = {
  overview: "Обзор",
  audience: "Люди",
  commerce: "Продажи",
  system: "Система",
  broadcast: "Рассылка",
};

const SETTINGS_DESCRIPTIONS: Record<AdminTab, string> = {
  overview: "Ключевые показатели, источники и UTM-кампании",
  audience: "Пользователи, выдачи, роли и режим доступа",
  commerce: "Пакеты, витрина и управление платежами",
  system: "Провайдеры, музыка и служебные параметры",
  broadcast: "Сообщение, вложение и настраиваемые inline-кнопки",
};

function AdminTabIcon({ tab }: { tab: AdminTab }) {
  const props = { size: 18, weight: "bold" as const };
  if (tab === "overview") return <Gauge {...props} />;
  if (tab === "audience") return <UsersThree {...props} />;
  if (tab === "commerce") return <Storefront {...props} />;
  if (tab === "system") return <SlidersHorizontal {...props} />;
  return <PaperPlaneTilt {...props} />;
}

const EMPTY_OFFER: OfferInput = { title: "", amount: "", asset: "USDT", starsAmount: null, rubAmount: null, icon: "", grantKind: "credits", grantAmount: 1 };

// Crypto Pay-supported assets — a single one per offer (no comma-separated lists).
const CRYPTO_ASSETS = ["USDT", "TON", "BTC", "ETH", "LTC", "BNB", "TRX", "USDC"] as const;

// --- Existing panels (unchanged) ---

const STATS_PERIODS: StatsPeriod[] = ["today", "week", "month", "all"];
const STATS_PERIOD_LABELS: Record<StatsPeriod, string> = {
  today: "День",
  week: "7 дней",
  month: "30 дней",
  all: "Всё",
};

function StatsPanel() {
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    api.adminStats(period).then(setStats).catch((e) => setError(e.message));
  }, [period]);

  return (
    <>
      <GlassPanel className="reveal">
        <h2>Статистика</h2>
        <Segmented
          options={STATS_PERIODS}
          value={period}
          onChange={setPeriod}
          ariaLabel="Период статистики"
          labels={STATS_PERIOD_LABELS}
        />
        {error && (
          <div className="stat-row" role="alert">
            <WarningCircle size={18} weight="bold" /> {error}
          </div>
        )}
        {!error && !stats && <div className="stat-row-label">Загрузка…</div>}
        {stats && (
          <>
            <div className="stat-row">
              <span className="stat-row-label">Всего пользователей</span>
              <span className="stat-row-value">{stats.totalUsers}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Новых за период</span>
              <span className="stat-row-value">{stats.newUsers}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Активных подписок</span>
              <span className="stat-row-value">{stats.activeSubscriptions}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Оплаченные покупки</span>
              <span className="stat-row-value">{stats.paidPurchases}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Выручка за период</span>
              <span className="stat-row-value">
                {stats.revenue.length === 0 ? "0" : stats.revenue.map((r) => `${r.total} ${r.asset}`).join(", ")}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Выручка всего</span>
              <span className="stat-row-value">
                {stats.revenueAllTime.length === 0
                  ? "0"
                  : stats.revenueAllTime.map((r) => `${r.total} ${r.asset}`).join(", ")}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Конверсия</span>
              <span className="stat-row-value">
                {stats.conversionRate === null ? "—" : `${(stats.conversionRate * 100).toFixed(1)}%`}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-row-label">Топ пакеты</span>
              <span className="stat-row-value">
                {stats.topOffers.length === 0
                  ? "—"
                  : stats.topOffers.map((o) => `${o.title} (${o.count})`).join(", ")}
              </span>
            </div>
          </>
        )}
      </GlassPanel>
      {stats && <FunnelPanel stats={stats} />}
      {stats && <TrafficSourcesPanel stats={stats} />}
      {stats && <UtmCampaignsPanel stats={stats} />}
      {stats && <UserSegmentsPanel stats={stats} />}
      {stats && <TopActiveUsersPanel stats={stats} />}
    </>
  );
}

const FUNNEL_LABELS: Record<AdminStats["funnel"][number]["event"], string> = {
  acquired: "Новые пользователи",
  miniapp_opened: "Открыли приложение",
  generation_started: "Начали генерацию",
  generation_completed: "Получили плейлист",
  checkout_started: "Начали оплату",
  purchase_completed: "Оплатили",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function revenueLabel(revenue: { asset: string; total: number }[]): string {
  return revenue.length === 0 ? "0" : revenue.map((item) => `${item.total} ${item.asset}`).join(", ");
}

function attributionLabel(value: string | null): string {
  if (!value) return "";
  return {
    direct: "Прямой",
    referral: "Реферальная программа",
    unknown: "Неизвестный",
    telegram: "Telegram",
    legacy: "Исторические данные",
    "deep-link": "Диплинк",
  }[value] ?? value;
}

function FunnelPanel({ stats }: { stats: AdminStats }) {
  return (
    <GlassPanel className="reveal">
      <h2>Воронка привлечения</h2>
      <p className="text-muted">Когорта пользователей, впервые пришедших за выбранный период.</p>
      {stats.funnel.map((step) => (
        <div className="stat-row" key={step.event}>
          <span className="stat-row-label">{FUNNEL_LABELS[step.event]}</span>
          <span className="stat-row-value">{step.users} · {percent(step.overallConversion)}</span>
        </div>
      ))}
    </GlassPanel>
  );
}

function TrafficSourcesPanel({ stats }: { stats: AdminStats }) {
  return (
    <GlassPanel className="reveal">
      <h2>Источники трафика</h2>
      {stats.trafficSources.length === 0 ? (
        <div className="stat-row-label">Нет данных</div>
      ) : stats.trafficSources.map((source) => (
        <div className="stat-row" key={`${source.source}:${source.medium ?? ""}`}>
          <span className="stat-row-label">
            {attributionLabel(source.source)}{source.medium ? ` / ${attributionLabel(source.medium)}` : ""}<br />
            <small>{source.users} пользователей · {source.payers} платящих · {percent(source.conversionRate)}</small>
          </span>
          <span className="stat-row-value admin-source-value">
            <strong>{source.users}</strong>
            <small>{source.revenue.length ? revenueLabel(source.revenue) : "без выручки"}</small>
          </span>
        </div>
      ))}
    </GlassPanel>
  );
}

function UtmLinkBuilder() {
  const [botBaseUrl, setBotBaseUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("telegram");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referral()
      .then((data) => setBotBaseUrl(data.link.split("?")[0] ?? ""))
      .catch(() => setBotBaseUrl(""));
  }, []);

  const fields = { source, medium, campaign, content };
  const payload = buildTelegramUtmPayload(fields);
  const link = botBaseUrl ? buildTelegramUtmLink(botBaseUrl, fields) : null;
  const started = source.trim().length > 0 || campaign.trim().length > 0;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-utm-builder">
      <div className="admin-section-heading">
        <span>
          <strong>Ссылка с UTM-меткой</strong>
          <small>Создаёт рабочий Telegram deep link и считает как новых, так и вернувшихся пользователей.</small>
        </span>
        {payload && <span className="admin-count-badge">{payload.length}/{TELEGRAM_START_PARAM_LIMIT}</span>}
      </div>
      <div className="admin-form-grid">
        <label className="admin-field">
          <span>Источник</span>
          <input className="glass-input" placeholder="telegram-channel" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>Канал</span>
          <input className="glass-input" placeholder="post" value={medium} onChange={(e) => setMedium(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>Кампания</span>
          <input className="glass-input" placeholder="summer-2026" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>Креатив</span>
          <input className="glass-input" placeholder="button-a" value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
      </div>
      {link ? (
        <div className="admin-generated-link">
          <code>{link}</code>
          <button type="button" className="glass-button" onClick={() => void copyLink()}>{copied ? "Скопировано" : "Копировать"}</button>
        </div>
      ) : started ? (
        <small className="text-danger" role="alert">Заполните источник и кампанию латиницей; вся метка должна быть не длиннее 64 символов.</small>
      ) : (
        <small className="text-muted">Заполните источник и кампанию — ссылка появится здесь.</small>
      )}
    </div>
  );
}

function UtmCampaignsPanel({ stats }: { stats: AdminStats }) {
  return (
    <GlassPanel className="reveal">
      <h2>UTM-кампании</h2>
      <UtmLinkBuilder />
      {stats.utmCampaigns.length === 0 ? (
        <div className="stat-row-label">Пока нет размеченного трафика</div>
      ) : stats.utmCampaigns.map((campaign) => (
        <div className="stat-row" key={`${campaign.source}:${campaign.medium ?? ""}:${campaign.campaign}`}>
          <span className="stat-row-label">
            {campaign.campaign}<br />
            <small>{attributionLabel(campaign.source)}{campaign.medium ? ` / ${attributionLabel(campaign.medium)}` : ""} · {campaign.users} пользователей</small>
          </span>
          <span className="stat-row-value">{campaign.payers} · {revenueLabel(campaign.revenue)}</span>
        </div>
      ))}
    </GlassPanel>
  );
}

function UserSegmentsPanel({ stats }: { stats: AdminStats }) {
  const seg = stats.segments;
  return (
    <GlassPanel className="reveal">
      <h2>Сегменты пользователей</h2>
      <div className="stat-row">
        <span className="stat-row-label">С подпиской</span>
        <span className="stat-row-value">{seg.activeSubscription}</span>
      </div>
      <div className="stat-row">
        <span className="stat-row-label">На трайле</span>
        <span className="stat-row-value">{seg.trialActive}</span>
      </div>
      <div className="stat-row">
        <span className="stat-row-label">Покупали, без подписки</span>
        <span className="stat-row-value">{seg.payingNoSubscription}</span>
      </div>
      <div className="stat-row">
        <span className="stat-row-label">Бесплатные, без покупок</span>
        <span className="stat-row-value">{seg.freeNoActivity}</span>
      </div>
    </GlassPanel>
  );
}

function TopActiveUsersPanel({ stats }: { stats: AdminStats }) {
  return (
    <GlassPanel className="reveal">
      <h2>Топ по активности</h2>
      {stats.topActiveUsers.length === 0 ? (
        <div className="stat-row-label">Нет данных</div>
      ) : (
        stats.topActiveUsers.map((u, i) => (
          <div className="stat-row" key={u.chatId}>
            <span className="stat-row-label">
              {i + 1}. {u.username ? `@${u.username}` : u.chatId}
            </span>
            <span className="stat-row-value">{u.generations}</span>
          </div>
        ))
      )}
    </GlassPanel>
  );
}

function OfferForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: OfferInput;
  submitLabel: string;
  onSubmit: (input: OfferInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<OfferInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {error && <p role="alert" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WarningCircle size={16} weight="bold" /> {error}</p>}
      <input className="glass-input" placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      <div className="row">
        <input className="glass-input" placeholder="Цена" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className="glass-input" value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} required>
          {CRYPTO_ASSETS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <input
        className="glass-input"
        placeholder="Цена в Stars"
        inputMode="numeric"
        value={form.starsAmount === null ? "" : String(form.starsAmount)}
        onChange={(e) => {
          const val = e.target.value;
          setForm({ ...form, starsAmount: val === "" ? null : Number(val) || 0 });
        }}
      />
      <input
        className="glass-input"
        placeholder="Цена в ₽ (СБП)"
        inputMode="numeric"
        value={form.rubAmount == null ? "" : String(form.rubAmount)}
        onChange={(e) => {
          const val = e.target.value;
          setForm({ ...form, rubAmount: val === "" ? null : Number(val) || 0 });
        }}
      />
      <input className="glass-input" placeholder="Иконка (emoji или URL)" value={form.icon ?? ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
      <Segmented ariaLabel="Тип" options={["credits", "subscription"] as const} value={form.grantKind} onChange={(grantKind: GrantKind) => setForm({ ...form, grantKind })} />
      <input className="glass-input" placeholder={form.grantKind === "subscription" ? "Дней подписки" : "Кол-во генераций"} inputMode="numeric" value={String(form.grantAmount)} onChange={(e) => setForm({ ...form, grantAmount: Number(e.target.value) || 0 })} required />
      <div className="row">
        <button type="submit" className="glass-button primary" disabled={busy}>{submitLabel}</button>
        {onCancel && <button type="button" className="glass-button" onClick={onCancel}>Отмена</button>}
      </div>
    </form>
  );
}

function OffersPanel() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.adminOffers().then((r) => setOffers(r.offers)).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function toggleActive(o: Offer) {
    await api.adminUpdateOffer(o.id, { active: !o.active });
    refresh();
  }

  async function remove(o: Offer) {
    await api.adminDeleteOffer(o.id);
    refresh();
  }

  return (
    <GlassPanel className="reveal">
      <h2>Пакеты</h2>
      {error && <p role="alert" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WarningCircle size={16} weight="bold" /> {error}</p>}
      <div className="stack mt-12">
        {offers.map((o) =>
          editing?.id === o.id ? (
            <OfferForm key={o.id} initial={{ title: o.title, amount: o.amount, asset: o.asset, starsAmount: o.starsAmount, rubAmount: o.rubAmount, icon: o.icon ?? "", active: o.active, grantKind: o.grantKind, grantAmount: o.grantAmount }} submitLabel="Сохранить" onSubmit={async (input) => { await api.adminUpdateOffer(o.id, input); setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />
          ) : (
            <div key={o.id} className="row wrap">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{o.active ? <Circle size={12} weight="fill" color="var(--accent-green-text)" /> : <Circle size={12} weight="regular" />} {o.icon ?? ""} {o.title}: {o.amount} {o.asset}{o.starsAmount ? ` / ${o.starsAmount} ` : ""}{o.starsAmount ? <Star size={12} weight="fill" /> : ""}{o.rubAmount ? ` / ${o.rubAmount} ₽` : ""} ({o.grantKind === "subscription" ? `${o.grantAmount} дн.` : `${o.grantAmount} ген.`})</span>
              <button className="glass-button" onClick={() => setEditing(o)}>Изменить</button>
              <button className="glass-button" onClick={() => toggleActive(o)}>{o.active ? "Скрыть" : "Показать"}</button>
              <button className="glass-button" onClick={() => remove(o)}>Удалить</button>
            </div>
          ),
        )}
        {creating ? (
          <OfferForm initial={EMPTY_OFFER} submitLabel="Создать" onSubmit={async (input) => { await api.adminCreateOffer(input); setCreating(false); refresh(); }} onCancel={() => setCreating(false)} />
        ) : (
          <button className="glass-button" onClick={() => setCreating(true)}>＋ Новый пакет</button>
        )}
      </div>
    </GlassPanel>
  );
}

function BroadcastPanel() {
  const namePlaceholder = "{name}";
  const [text, setText] = useState("");
  const [media, setMedia] = useState<File | null>(null);
  const [buttons, setButtons] = useState<AdminBroadcastButton[]>([
    { kind: "preset", preset: "open_app", text: "Открыть приложение", style: "primary" },
  ]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const buttonPresets: Array<{ id: AdminBroadcastButtonPreset; label: string }> = [
    { id: "open_app", label: "Открыть приложение" },
    { id: "search", label: "Поиск" },
    { id: "playlists", label: "Мои плейлисты" },
    { id: "profile", label: "Профиль" },
  ];

  function addPreset(id: AdminBroadcastButtonPreset) {
    const preset = buttonPresets.find((item) => item.id === id);
    if (!preset || buttons.some((button) => button.kind === "preset" && button.preset === id)) return;
    setButtons((current) => [...current, { kind: "preset", preset: id, text: preset.label }]);
    setConfirmSend(false);
  }

  function addCustomButton() {
    if (buttons.length >= 8) return;
    setButtons((current) => [...current, { kind: "url", text: "Подробнее", url: "https://" }]);
    setConfirmSend(false);
  }

  function updateButton(index: number, patch: Partial<AdminBroadcastButton>) {
    setButtons((current) => current.map((button, itemIndex) => (
      itemIndex === index ? { ...button, ...patch } as AdminBroadcastButton : button
    )));
    setConfirmSend(false);
  }

  function removeButton(index: number) {
    setButtons((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setConfirmSend(false);
  }

  function isValidButton(button: AdminBroadcastButton): boolean {
    if (!button.text.trim() || button.text.trim().length > 64) return false;
    if (button.kind === "preset") return true;
    try {
      const url = new URL(button.url.trim());
      return ["https:", "http:", "tg:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  const buttonsValid = buttons.every(isValidButton);

  function mediaKind(file: File): "Изображение" | "GIF" | "Видео" | "Файл" {
    const name = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();
    if (mimeType && mimeType !== "application/octet-stream") {
      if (mimeType === "image/gif") return "GIF";
      if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return "Изображение";
      if (mimeType === "video/mp4") return "Видео";
      return "Файл";
    }
    if (name.endsWith(".gif")) return "GIF";
    if (/\.(jpe?g|png|webp)$/.test(name)) return "Изображение";
    if (name.endsWith(".mp4")) return "Видео";
    return "Файл";
  }

  function selectMedia(file: File | null) {
    setResult(null);
    setConfirmSend(false);
    if (!file) {
      setMedia(null);
      return;
    }
    const maxBytes = mediaKind(file) === "Изображение" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMedia(null);
      setResult(
        `Ошибка: ${mediaKind(file) === "Изображение"
          ? "изображение должно быть не больше 10 МБ"
          : "вложение должно быть не больше 50 МБ"}`,
      );
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      return;
    }
    setMedia(file);
  }

  function removeMedia() {
    setMedia(null);
    setConfirmSend(false);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  }

  function insertNamePlaceholder() {
    const input = textInputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? start;
    const nextText = `${text.slice(0, start)}${namePlaceholder}${text.slice(end)}`;
    setText(nextText);
    setConfirmSend(false);
    requestAnimationFrame(() => {
      input?.focus();
      const caret = start + namePlaceholder.length;
      input?.setSelectionRange(caret, caret);
    });
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setResult(null);
    setConfirmSend(false);
    try {
      const preparedButtons = buttons.map((button) => ({ ...button, text: button.text.trim() }));
      const r = await api.adminBroadcast({ text: text.trim(), buttons: preparedButtons, media });
      setResult(`Доставлено: ${r.sent}, не доставлено: ${r.failed}`);
      setText("");
      setMedia(null);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    } catch (err) {
      setResult(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="reveal">
      <h2>Рассылка</h2>
      <form className="stack mt-12" onSubmit={send}>
        <textarea
          ref={textInputRef}
          className="glass-input"
          rows={5}
          placeholder={media
            ? "Подпись к вложению (необязательно, поддерживается HTML)"
            : "Текст сообщения (поддерживается HTML)"}
          value={text}
          maxLength={media ? 1024 : 4096}
          onChange={(e) => {
            setText(e.target.value);
            setConfirmSend(false);
          }}
        />
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <small>
            <code>{namePlaceholder}</code> заменится на имя каждого пользователя.
          </small>
          <button type="button" className="glass-button" onClick={insertNamePlaceholder}>
            Вставить {namePlaceholder}
          </button>
        </div>

        <div className="stack">
          <strong>Вложение</strong>
          <label
            className="glass-button"
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Paperclip size={18} weight="bold" />
            {media ? "Заменить вложение" : "Прикрепить изображение, GIF, видео или файл"}
            <input
              ref={mediaInputRef}
              type="file"
              hidden
              onChange={(e) => selectMedia(e.target.files?.[0] ?? null)}
            />
          </label>
          {media && (
            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <span>
                {mediaKind(media)} · {media.name} · {(media.size / 1024 / 1024).toFixed(1)} МБ
              </span>
              <button type="button" className="glass-button" aria-label="Убрать вложение" onClick={removeMedia}>
                <X size={16} weight="bold" />
              </button>
            </div>
          )}
        </div>

        <div className="stack admin-broadcast-buttons">
          <div className="admin-section-heading">
            <span>
              <strong>Inline-кнопки</strong>
              <small>Название, ссылка и цвет задаются отдельно для каждой кнопки.</small>
            </span>
            <span className="admin-count-badge">{buttons.length}/8</span>
          </div>
          <div className="admin-preset-grid" aria-label="Готовые кнопки">
            {buttonPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="glass-button admin-preset-button"
                disabled={buttons.length >= 8 || buttons.some((button) => button.kind === "preset" && button.preset === preset.id)}
                onClick={() => addPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button type="button" className="glass-button admin-add-custom" disabled={buttons.length >= 8} onClick={addCustomButton}>
            <Plus size={16} weight="bold" /> Добавить кнопку со своей ссылкой
          </button>

          {buttons.length > 0 && (
            <div className="admin-button-list">
              {buttons.map((button, index) => (
                <div className="admin-button-editor" key={`${button.kind}-${button.kind === "preset" ? button.preset : "url"}-${index}`}>
                  <div className="admin-button-editor-head">
                    <span>{button.kind === "preset" ? "Кнопка приложения" : "Своя ссылка"}</span>
                    <button type="button" className="icon-btn" aria-label="Удалить кнопку" onClick={() => removeButton(index)}>
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                  <label className="admin-field">
                    <span>Название</span>
                    <input
                      className="glass-input"
                      maxLength={64}
                      value={button.text}
                      onChange={(event) => updateButton(index, { text: event.target.value })}
                    />
                  </label>
                  {button.kind === "url" && (
                    <label className="admin-field admin-button-url">
                      <span>Ссылка</span>
                      <input
                        className="glass-input"
                        inputMode="url"
                        placeholder="https://example.com"
                        value={button.url}
                        onChange={(event) => updateButton(index, { url: event.target.value } as Partial<AdminBroadcastButton>)}
                      />
                    </label>
                  )}
                  <label className="admin-field">
                    <span>Цвет</span>
                    <select
                      className="glass-input"
                      value={button.style ?? ""}
                      onChange={(event) => updateButton(index, {
                        style: (event.target.value || undefined) as AdminBroadcastButtonStyle | undefined,
                      })}
                    >
                      <option value="">Обычный</option>
                      <option value="primary">Синий</option>
                      <option value="success">Зелёный</option>
                      <option value="danger">Красный</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          )}
          {!buttonsValid && <small className="text-danger" role="alert">Заполните название и корректную http(s):// или tg:// ссылку.</small>}
        </div>

        {confirmSend ? (
          <div className="stack">
            <small>
              Всем пользователям уйдёт {media
                ? `${mediaKind(media).toLowerCase()}${text.trim() ? " с подписью" : ""}`
                : "текстовое сообщение"}
              {buttons.length ? ` и кнопок: ${buttons.length}` : " без кнопок"}.
              {text.includes(namePlaceholder) ? " Обращение будет персонализировано по имени." : ""}
            </small>
            <div className="row">
              <button
                type="button"
                className="glass-button primary"
                onClick={() => void send()}
                disabled={busy || !buttonsValid}
              >
                Подтвердить отправку
              </button>
              <button type="button" className="glass-button" onClick={() => setConfirmSend(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="glass-button primary"
            disabled={busy || !buttonsValid || (!text.trim() && !media)}
            onClick={() => setConfirmSend(true)}
          >
            Отправить всем
          </button>
        )}
        {result && <p role="status">{result}</p>}
      </form>
    </GlassPanel>
  );
}

function ShopSettingsPanel() {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.adminShopSettings().then(setSettings).catch((e) => setStatus(`Ошибка: ${e.message}`));
  }, []);

  if (!settings) return <GlassPanel>{status ?? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WarningCircle size={16} weight="bold" /> Загрузка…</span>}</GlassPanel>;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const saved = await api.adminSetShopSettings(settings!);
      setSettings(saved);
      setStatus("Сохранено ✓");
    } catch (err) {
      setStatus(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="reveal">
      <h2>Настройки магазина</h2>
      <form className="stack mt-12" onSubmit={save}>
        <input className="glass-input" placeholder="Название магазина" value={settings.shopName} onChange={(e) => setSettings({ ...settings, shopName: e.target.value })} />
        <input className="glass-input" placeholder="Контакт поддержки" value={settings.supportContact} onChange={(e) => setSettings({ ...settings, supportContact: e.target.value })} />
        <textarea className="glass-input" rows={3} placeholder="Текст «О магазине»" value={settings.aboutText} onChange={(e) => setSettings({ ...settings, aboutText: e.target.value })} />
        <input className="glass-input" placeholder="Иконка хедера (emoji или URL)" value={settings.headerIcon ?? ""} onChange={(e) => setSettings({ ...settings, headerIcon: e.target.value })} />
        <input className="glass-input" placeholder="Название хедера (по умолчанию Music Agent)" value={settings.headerTitle} onChange={(e) => setSettings({ ...settings, headerTitle: e.target.value })} />
        <button type="submit" className="glass-button primary" disabled={busy}>Сохранить</button>
        {status && <p role="status">{status}</p>}
      </form>
    </GlassPanel>
  );
}

function AccessPanel() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newChatId, setNewChatId] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  function refresh() {
    api.adminAccess().then((r) => setEntries(r.entries)).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function add() {
    const chatId = Number(newChatId);
    if (!Number.isFinite(chatId)) return;
    setAdding(true);
    try {
      await api.adminAccessAdd(chatId, newIsAdmin);
      setShowAddForm(false);
      setNewChatId("");
      setNewIsAdmin(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function remove(chatId: number) {
    setConfirmRemove(null);
    try {
      await api.adminAccessRemove(chatId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleRole(e: AllowlistEntry) {
    try {
      await api.adminAccessSetRole(e.chatId, !e.isAdmin);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Управление доступом</h2>
      <button className="glass-button" onClick={() => setShowAddForm(!showAddForm)}>＋ Добавить пользователя</button>
      {showAddForm && (
        <div className="stack mt-12" style={{ gap: 8 }}>
          <input
            className="glass-input"
            placeholder="Telegram chat ID"
            type="number"
            value={newChatId}
            onChange={(e) => setNewChatId(e.target.value)}
          />
          <label className="fs-label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
            Назначить администратором
          </label>
          <button className="glass-button primary" disabled={adding || !newChatId.trim()} onClick={add}>
            {adding ? "Добавление…" : "Добавить"}
          </button>
        </div>
      )}
      <div className="stack mt-12">
          {entries.map((e) => (
          <div key={e.chatId} className="admin-user-row">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>#{e.chatId} {e.isAdmin ? <><Crown size={16} weight="bold" /> Админ</> : <><User size={16} weight="bold" /> Пользователь</>}</span>
            <div className="row">
              <button className="glass-button" onClick={() => toggleRole(e)}>{e.isAdmin ? "Снять админа" : "Назначить админом"}</button>
              {confirmRemove === e.chatId ? (
                <div className="row" style={{ gap: 4 }}>
                  <button className="glass-button" onClick={() => remove(e.chatId)}>✓ Да</button>
                  <button className="glass-button" onClick={() => setConfirmRemove(null)}>✕ Нет</button>
                </div>
              ) : (
                <button className="glass-button" onClick={() => setConfirmRemove(e.chatId)}>Удалить</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function ProviderConfigPanel() {
  const [providers, setProviders] = useState<ProviderConfigEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editModel, setEditModel] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");

  function refresh() {
    api.adminProviderConfig().then((r) => setProviders(r.providers)).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  function startEdit(p: ProviderConfigEntry) {
    setEditId(p.id);
    setEditModel(p.dbOverrides.model ?? "");
    setEditBaseUrl(p.dbOverrides.baseUrl ?? "");
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      await api.adminUpdateProviderConfig(editId, {
        model: editModel || null,
        baseUrl: editBaseUrl || null,
      });
      setEditId(null);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;
  if (providers.length === 0) return <GlassPanel>Загрузка…</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Конфигурация провайдеров</h2>
      <div className="stack mt-12">
        {providers.map((p) => (
          <div key={p.id}>
            {editId === p.id ? (
              <div className="stack">
                <input className="glass-input" placeholder="Model" value={editModel} onChange={(e) => setEditModel(e.target.value)} />
                <input className="glass-input" placeholder="Base URL" value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} />
                <div className="row">
                  <button className="glass-button primary" onClick={saveEdit}>Сохранить</button>
                  <button className="glass-button" onClick={() => setEditId(null)}>Отмена</button>
                </div>
              </div>
            ) : (
              <div className="admin-user-row">
                <span>
                  <strong>{p.id}</strong>
                  {p.envDefaults.apiKeyConfigured ? <><Key size={14} weight="bold" /></> : <><XCircle size={14} weight="bold" /></>}<br />
                  <small>Model: {p.effective.model}</small>
                  {p.effective.baseUrl && <><br /><small>URL: {p.effective.baseUrl}</small></>}
                  {p.dbOverrides.model && <><br /><small style={{ opacity: 0.6 }}>(override: {p.dbOverrides.model})</small></>}
                </span>
                <button className="glass-button" onClick={() => startEdit(p)}>Изменить</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function UnifiedSettingsPanel() {
  const [settings, setSettings] = useState<SettingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function refresh() {
    api.adminAllSettings().then((r) => setSettings(r.settings)).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function add() {
    if (!newKey.trim()) return;
    try {
      await api.adminCreateSetting(newKey.trim(), newValue.trim());
      setNewKey("");
      setNewValue("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function update(key: string) {
    try {
      await api.adminUpdateSetting(key, editValue || null);
      setEditingKey(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEdit(key: string, value: string) {
    setEditingKey(key);
    setEditValue(value);
  }

  const structuredKeys = new Set([
    "sessions",
    "active_provider",
    "active_backend",
    "shop_name",
    "support_contact",
    "about_text",
    "header_icon",
    "header_title",
    "payments_enabled",
    "open_access",
  ]);
  const visibleSettings = settings.filter((setting) => (
    !structuredKeys.has(setting.key) && !setting.key.startsWith("provider:")
  ));

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Дополнительные параметры</h2>
      <p className="text-muted">Здесь только параметры без отдельного экрана — управляемые настройки больше не дублируются.</p>
      <div className="stack mt-12">
        <div className="row">
          <input className="glass-input" placeholder="Ключ" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <input className="glass-input" placeholder="Значение" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <button className="glass-button primary" onClick={add}>＋</button>
        </div>
        {visibleSettings.map((s) => (
          <div key={s.key}>
            {editingKey === s.key ? (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13, minWidth: 80 }}>{s.key}</strong>
                <input
                  className="glass-input"
                  style={{ flex: 1, minWidth: 120, padding: "6px 10px", fontSize: 13 }}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
                <button className="glass-button" style={{ padding: "6px 10px", fontSize: 13 }} onClick={() => update(s.key)}>Сохранить</button>
                <button className="glass-button" style={{ padding: "6px 10px", fontSize: 13 }} onClick={() => setEditingKey(null)}>Отмена</button>
              </div>
            ) : (
              <div className="admin-user-row">
                <span className="admin-user-info">
                  <strong>{s.key}</strong><br />
                  <small style={{ wordBreak: "break-all" }}>{s.value}</small>
                </span>
                <button className="glass-button" onClick={() => startEdit(s.key, s.value)}><PencilSimple size={16} weight="bold" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function PaymentsPanel() {
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminPaymentsConfig().then(setConfig).catch((e) => setError(e.message));
  }, []);

  async function toggle() {
    if (!config) return;
    setBusy(true);
    try {
      await api.adminSetPaymentsConfig(config.paymentsEnabled ? false : true);
      const updated = await api.adminPaymentsConfig();
      setConfig(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetToEnv() {
    setBusy(true);
    try {
      await api.adminSetPaymentsConfig(null);
      const updated = await api.adminPaymentsConfig();
      setConfig(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;
  if (!config) return <GlassPanel>Загрузка…</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Платежи</h2>
      <p style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        Статус: {config.paymentsEnabled
          ? <><Circle size={12} weight="fill" color="var(--accent-green-text)" /> Включены</>
          : <><Circle size={12} weight="fill" color="var(--accent-red-text)" /> Выключены</>} ({config.source})
      </p>
      <div className="row mt-12">
        <button className="glass-button primary" onClick={toggle} disabled={busy}>
          {config.paymentsEnabled ? "Выключить" : "Включить"}
        </button>
        {config.source === "db" && (
          <button className="glass-button" onClick={resetToEnv} disabled={busy}>Сбросить (env)</button>
        )}
      </div>
    </GlassPanel>
  );
}

function AccessModePanel() {
  const [openAccess, setOpenAccess] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminAccessConfig().then((c) => setOpenAccess(c.openAccess)).catch((e) => setError(e.message));
  }, []);

  async function toggle() {
    if (openAccess === null) return;
    setBusy(true);
    try {
      await api.adminSetAccessConfig(!openAccess);
      const updated = await api.adminAccessConfig();
      setOpenAccess(updated.openAccess);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;
  if (openAccess === null) return <GlassPanel>Загрузка…</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Доступ</h2>
      <p style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        Режим: {openAccess
          ? <><Circle size={12} weight="fill" color="var(--accent-green-text)" /> Открыт для всех</>
          : <><Circle size={12} weight="fill" color="var(--accent-red-text)" /> Только белый список</>}
      </p>
      <div className="row mt-12">
        <button className="glass-button primary" onClick={toggle} disabled={busy}>
          {openAccess ? "Только белый список" : "Открыть для всех"}
        </button>
      </div>
    </GlassPanel>
  );
}

// --- Issuance panel (grant credits, subscription, history) ---------------

function UserManagementPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [creditsAmount, setCreditsAmount] = useState("");
  const [daysAmount, setDaysAmount] = useState("");
  const [history, setHistory] = useState<import("../lib/api").GrantHistoryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  function refreshUsers() {
    api.adminUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  }

  function refreshHistory(chatId: number) {
    api.adminGrantHistory(chatId).then((r) => setHistory(r.history)).catch(() => {});
  }

  useEffect(refreshUsers, []);

  const filtered = search
    ? users.filter(
        (u) =>
          String(u.chatId).includes(search) ||
          (u.username ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (u.firstName ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  async function grantCredits() {
    const n = Number(creditsAmount);
    if (!Number.isFinite(n) || n === 0 || !selected) return;
    setBusy(true);
    try {
      const result = await api.adminGrantCredits(selected.chatId, n);
      setCreditsAmount("");
      setSelected((current) => current ? { ...current, credits: result.credits } : current);
      refreshUsers();
      refreshHistory(selected.chatId);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function grantSubscription() {
    const n = Number(daysAmount);
    if (!Number.isFinite(n) || n <= 0 || !selected) return;
    setBusy(true);
    try {
      const result = await api.adminExtendSubscription(selected.chatId, n);
      setDaysAmount("");
      setSelected((current) => current ? { ...current, subscriptionUntil: result.subscriptionUntil } : current);
      refreshUsers();
      refreshHistory(selected.chatId);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokeSub() {
    if (!selected) return;
    setConfirmRevoke(false);
    setBusy(true);
    try {
      await api.adminRevokeSubscription(selected.chatId);
      setSelected((current) => current ? { ...current, subscriptionUntil: null } : current);
      refreshUsers();
      refreshHistory(selected.chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function selectUser(u: AdminUser) {
    setSelected(u);
    setCreditsAmount("");
    setDaysAmount("");
    refreshHistory(u.chatId);
  }

  const hasSub = (u: AdminUser) => u.subscriptionUntil && u.subscriptionUntil > Math.floor(Date.now() / 1000);
  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString();

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Пользователи и выдачи</h2>

      <input
        className="glass-input"
        placeholder="Поиск по chat ID или @username"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
      />

      {!selected && (
        <div className="stack mt-12" style={{ maxHeight: 300, overflowY: "auto" }}>
          {filtered.map((u) => (
            <button
              key={u.chatId}
              className="glass-button"
              style={{ textAlign: "left", width: "100%" }}
              onClick={() => selectUser(u)}
            >
              <strong>{u.firstName ?? (u.username ? `@${u.username}` : `#${u.chatId}`)}</strong>
              {u.firstName && u.username ? ` · @${u.username}` : ""}
              <br />
              <small>Credits: {u.credits} | Подписка: {hasSub(u) ? `до ${fmtDate(u.subscriptionUntil!)}` : "нет"}</small>
            </button>
          ))}
          {filtered.length === 0 && <p>Нет пользователей</p>}
        </div>
      )}

      {selected && (
        <>
          <div className="stack mt-12">
            <p>
              <strong>{selected.firstName ?? (selected.username ? `@${selected.username}` : `#${selected.chatId}`)}</strong>
              {selected.firstName && selected.username ? ` · @${selected.username}` : ""}
              <br />
              Credits: <strong>{selected.credits}</strong>
              {" | "}
              Подписка: <strong>{hasSub(selected) ? `до ${fmtDate(selected.subscriptionUntil!)}` : "нет"}</strong>
            </p>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="glass-input"
                style={{ width: 120 }}
                placeholder="Кол-во credits"
                type="number"
                value={creditsAmount}
                onChange={(e) => setCreditsAmount(e.target.value)}
              />
              <button className="glass-button primary" onClick={grantCredits} disabled={busy}>
                Выдать credits
              </button>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="glass-input"
                style={{ width: 120 }}
                placeholder="Дней подписки"
                type="number"
                value={daysAmount}
                onChange={(e) => setDaysAmount(e.target.value)}
              />
              <button className="glass-button primary" onClick={grantSubscription} disabled={busy}>
                Выдать подписку
              </button>
            </div>

            {hasSub(selected) && (
              confirmRevoke ? (
                <div className="row">
                  <button className="glass-button" style={{ color: "var(--accent)" }} onClick={revokeSub} disabled={busy}>✓ Да, отозвать</button>
                  <button className="glass-button" onClick={() => setConfirmRevoke(false)}>Отмена</button>
                </div>
              ) : (
                <button className="glass-button" style={{ color: "var(--accent)" }} onClick={() => setConfirmRevoke(true)} disabled={busy}>
                  Отозвать подписку
                </button>
              )
            )}
          </div>

          <div className="stack mt-12">
            <h3>История выдач</h3>
            {history.length === 0 ? (
              <p>Нет операций</p>
            ) : (
              <div className="stack">
                {history.map((h) => (
                  <div key={h.id} className="row" style={{ justifyContent: "space-between", fontSize: "0.9em" }}>
                    <span>
                      {h.type === "credits" ? (h.amount > 0 ? <><Plus size={14} weight="bold" /> Credits</> : <><Minus size={14} weight="bold" /> Credits</>) : h.type === "subscription" ? <><Calendar size={14} weight="bold" /> Подписка</> : <><Prohibit size={14} weight="bold" /> Отзыв подписки</>}
                      {" "}{h.type !== "subscription_revoked" ? Math.abs(h.amount) : ""}
                    </span>
                    <small>{fmtDate(h.createdAt)}</small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="glass-button mt-12" onClick={() => { setSelected(null); setHistory([]); }}>
            ← Назад к списку
          </button>
        </>
      )}
    </GlassPanel>
  );
}

// --- Tab bar for admin navigation ---

function AdminTabBar({ tab, onTab }: { tab: AdminTab; onTab: (t: AdminTab) => void }) {
  return (
    <nav className="admin-tabs" aria-label="Секции админки">
      {(SETTINGS_TABS as AdminTab[]).map((t) => (
        <button
          key={t}
          type="button"
          className={`admin-tab${tab === t ? " active" : ""}`}
          onClick={() => onTab(t)}
        >
          <AdminTabIcon tab={t} />
          <span>{SETTINGS_LABELS[t]}</span>
        </button>
      ))}
    </nav>
  );
}

// --- Main AdminScreen with tab navigation ---

export default function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  useEffect(() => {
    api.adminSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  function handleSettingChange(key: "activeProvider" | "activeBackend", value: string) {
    if (key === "activeProvider") {
      api.setActiveProvider(value).then(() => setSettings((s) => s ? { ...s, activeProvider: value } : s));
    } else {
      api.setActiveBackend(value).then(() => setSettings((s) => s ? { ...s, activeBackend: value } : s));
    }
  }

  return (
    <div className="stack admin-shell">
      <header className="admin-header">
        <span className="admin-eyebrow">Управление</span>
        <h1>Админка</h1>
        <p>{SETTINGS_DESCRIPTIONS[tab]}</p>
      </header>
      <AdminTabBar tab={tab} onTab={setTab} />
      {tab === "overview" && <StatsPanel />}
      {tab === "audience" && (
        <>
          <UserManagementPanel />
          <AccessModePanel />
          <AccessPanel />
        </>
      )}
      {tab === "commerce" && (
        <>
          <OffersPanel />
          <ShopSettingsPanel />
          <PaymentsPanel />
        </>
      )}
      {tab === "system" && (
        <>
          <AdminSettingsBar settings={settings} onChange={handleSettingChange} />
          <ProviderConfigPanel />
          <UnifiedSettingsPanel />
        </>
      )}
      {tab === "broadcast" && <BroadcastPanel />}
    </div>
  );
}
