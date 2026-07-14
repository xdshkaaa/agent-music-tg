import { useEffect, useState, type FormEvent } from "react";
import {
  WarningCircle, Circle, Key, XCircle, Plus, Minus, Star,
  Calendar, Prohibit, Crown, User, PencilSimple,
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
} from "../lib/api";
import { api } from "../lib/api";

type AdminTab = "stats" | "offers" | "shop" | "users" | "issuance" | "access" | "providers" | "settings" | "payments" | "broadcast";

const SETTINGS_TABS: AdminTab[] = ["stats", "offers", "shop", "users", "issuance", "access", "providers", "settings", "payments", "broadcast"];
const SETTINGS_LABELS: Record<AdminTab, string> = {
  stats: "Статистика",
  offers: "Пакеты",
  shop: "Магазин",
  users: "Пользователи",
  issuance: "Выдача",
  access: "Доступ",
  providers: "Провайдеры",
  settings: "Настройки",
  payments: "Платежи",
  broadcast: "Рассылка",
};

const EMPTY_OFFER: OfferInput = { title: "", amount: "", asset: "USDT", starsAmount: null, icon: "", grantKind: "credits", grantAmount: 1 };

// --- Existing panels (unchanged) ---

function StatsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;
  if (!stats) return <GlassPanel>Загрузка…</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Статистика</h2>
      <p>Пользователей: {stats.totalUsers}</p>
      <p>Оплаченных покупок: {stats.paidPurchases}</p>
      <p>
        Выручка:{" "}
        {stats.revenue.length === 0
          ? "0"
          : stats.revenue.map((r) => `${r.total} ${r.asset}`).join(", ")}
      </p>
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
        <input className="glass-input" placeholder="Цена" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <input className="glass-input" placeholder="Актив (USDT, TON…)" value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value.toUpperCase() })} required />
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
            <OfferForm key={o.id} initial={{ title: o.title, amount: o.amount, asset: o.asset, starsAmount: o.starsAmount, icon: o.icon ?? "", active: o.active, grantKind: o.grantKind, grantAmount: o.grantAmount }} submitLabel="Сохранить" onSubmit={async (input) => { await api.adminUpdateOffer(o.id, input); setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />
          ) : (
            <div key={o.id} className="row wrap">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{o.active ? <Circle size={12} weight="fill" color="var(--accent-green-text)" /> : <Circle size={12} weight="regular" />} {o.icon ?? ""} {o.title} — {o.amount} {o.asset}{o.starsAmount ? ` / ${o.starsAmount} ` : ""}{o.starsAmount ? <Star size={12} weight="fill" /> : ""} ({o.grantKind === "subscription" ? `${o.grantAmount} дн.` : `${o.grantAmount} ген.`})</span>
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
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setConfirmSend(false);
    try {
      const r = await api.adminBroadcast(text.trim());
      setResult(`Доставлено: ${r.sent}, не доставлено: ${r.failed}`);
      setText("");
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
        <textarea className="glass-input" rows={4} placeholder="Текст сообщения" value={text} onChange={(e) => setText(e.target.value)} required />
        {confirmSend ? (
          <div className="row">
            <button type="button" className="glass-button primary" onClick={send} disabled={busy}>✓ Подтвердить</button>
            <button type="button" className="glass-button" onClick={() => setConfirmSend(false)}>Отмена</button>
          </div>
        ) : (
          <button type="button" className="glass-button primary" disabled={busy || text.trim().length === 0} onClick={() => setConfirmSend(true)}>Отправить всем</button>
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
        <input className="glass-input" placeholder="Название хедера (по умолчанию agent music)" value={settings.headerTitle} onChange={(e) => setSettings({ ...settings, headerTitle: e.target.value })} />
        <button type="submit" className="glass-button primary" disabled={busy}>Сохранить</button>
        {status && <p role="status">{status}</p>}
      </form>
    </GlassPanel>
  );
}

// --- New panels ---

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creditsInput, setCreditsInput] = useState<Record<number, string>>({});
  const [subInput, setSubInput] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  function refresh() {
    api.adminUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function grantCredits(chatId: number) {
    const n = Number(creditsInput[chatId]);
    if (!Number.isFinite(n) || n === 0) return;
    setSavingId(chatId);
    try {
      await api.adminGrantCredits(chatId, n);
      setCreditsInput((prev) => ({ ...prev, [chatId]: "" }));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  async function extendSub(chatId: number) {
    const n = Number(subInput[chatId]);
    if (!Number.isFinite(n) || n <= 0) return;
    setSavingId(chatId);
    try {
      await api.adminExtendSubscription(chatId, n);
      setSubInput((prev) => ({ ...prev, [chatId]: "" }));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  const hasSub = (u: AdminUser) => u.subscriptionUntil && u.subscriptionUntil > Math.floor(Date.now() / 1000);

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Пользователи</h2>
      {users.length === 0 ? <p>Нет пользователей</p> : (
        <div className="stack mt-12">
          {users.map((u) => (
            <div key={u.chatId}>
              <div className="admin-user-row">
                <span className="admin-user-info">
                  <strong>{u.username ?? `#${u.chatId}`}</strong>
                  <br />
                  <small>Credits: {u.credits} | Подписка: {hasSub(u) ? `до ${new Date((u.subscriptionUntil!) * 1000).toLocaleDateString()}` : "нет"}</small>
                </span>
                <div className="row" style={{ gap: 4 }}>
                  <input
                    className="glass-input"
                    style={{ width: 80, padding: "6px 8px", fontSize: 13 }}
                    placeholder="credits"
                    type="number"
                    value={creditsInput[u.chatId] ?? ""}
                    onChange={(e) => setCreditsInput((prev) => ({ ...prev, [u.chatId]: e.target.value }))}
                    disabled={savingId === u.chatId}
                  />
                  <button className="glass-button" style={{ padding: "6px 10px", fontSize: 13 }} disabled={savingId === u.chatId} onClick={() => grantCredits(u.chatId)}>Выдать</button>
                  <input
                    className="glass-input"
                    style={{ width: 80, padding: "6px 8px", fontSize: 13 }}
                    placeholder="дней"
                    type="number"
                    value={subInput[u.chatId] ?? ""}
                    onChange={(e) => setSubInput((prev) => ({ ...prev, [u.chatId]: e.target.value }))}
                    disabled={savingId === u.chatId}
                  />
                  <button className="glass-button" style={{ padding: "6px 10px", fontSize: 13 }} disabled={savingId === u.chatId} onClick={() => extendSub(u.chatId)}>Подписка</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
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

  const hiddenKeys = new Set(["sessions"]);

  if (error) return <GlassPanel role="alert"><WarningCircle size={18} weight="bold" /> {error}</GlassPanel>;

  return (
    <GlassPanel className="reveal">
      <h2>Все настройки</h2>
      <div className="stack mt-12">
        <div className="row">
          <input className="glass-input" placeholder="Ключ" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <input className="glass-input" placeholder="Значение" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <button className="glass-button primary" onClick={add}>＋</button>
        </div>
        {settings.filter((s) => !hiddenKeys.has(s.key)).map((s) => (
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

// --- Issuance panel (grant credits, subscription, history) ---------------

function IssuancePanel() {
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
          (u.username ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  async function grantCredits() {
    const n = Number(creditsAmount);
    if (!Number.isFinite(n) || n === 0 || !selected) return;
    setBusy(true);
    try {
      await api.adminGrantCredits(selected.chatId, n);
      setCreditsAmount("");
      refreshUsers();
      refreshHistory(selected.chatId);
      setSelected(getUpdatedUser(selected.chatId));
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
      await api.adminExtendSubscription(selected.chatId, n);
      setDaysAmount("");
      refreshUsers();
      refreshHistory(selected.chatId);
      setSelected(getUpdatedUser(selected.chatId));
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
      refreshUsers();
      refreshHistory(selected.chatId);
      setSelected(getUpdatedUser(selected.chatId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function getUpdatedUser(chatId: number): AdminUser | null {
    const u = users.find((x) => x.chatId === chatId);
    return u ?? null;
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
      <h2>Выдача</h2>

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
              <strong>{u.username ?? `#${u.chatId}`}</strong>
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
              <strong>{selected.username ?? `#${selected.chatId}`}</strong>
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
          {SETTINGS_LABELS[t]}
        </button>
      ))}
    </nav>
  );
}

// --- Main AdminScreen with tab navigation ---

export default function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>("stats");
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  useEffect(() => {
    api.adminSettings().then(setSettings).catch(() => {});
  }, []);

  function handleSettingChange(key: "activeProvider" | "activeBackend", value: string) {
    if (key === "activeProvider") {
      api.setActiveProvider(value).then(() => setSettings((s) => s ? { ...s, activeProvider: value } : s));
    } else {
      api.setActiveBackend(value).then(() => setSettings((s) => s ? { ...s, activeBackend: value } : s));
    }
  }

  return (
    <div className="stack">
      <AdminSettingsBar settings={settings} onChange={handleSettingChange} />
      <AdminTabBar tab={tab} onTab={setTab} />
      {tab === "stats" && <StatsPanel />}
      {tab === "offers" && <OffersPanel />}
      {tab === "shop" && <ShopSettingsPanel />}
      {tab === "users" && <UsersPanel />}
      {tab === "issuance" && <IssuancePanel />}
      {tab === "access" && <AccessPanel />}
      {tab === "providers" && <ProviderConfigPanel />}
      {tab === "settings" && <UnifiedSettingsPanel />}
      {tab === "payments" && <PaymentsPanel />}
      {tab === "broadcast" && <BroadcastPanel />}
    </div>
  );
}