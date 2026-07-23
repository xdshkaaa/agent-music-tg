/*
 * THESIS: An internal "mission control" for the two music-bot environments —
 * an operator glances at one screen and knows whether prod is healthy, what
 * shipped in dev, and can act (nothing here is read-only chrome; every
 * number traces to a real query).
 * OWN-WORLD: This is the Operate register of the same near-black/rose system
 * the Mini App uses, deliberately de-glassed — flat panels, hairline
 * borders, dense tabular data, no blur. Golos Text only for the page title;
 * everything else is the system body font at a denser, desktop-appropriate
 * scale than the phone app's.
 * STORY: sidebar orients (which surface, which environment) → topbar commits
 * to a period → KPI row answers "how are we doing" in one eye-sweep → charts
 * show trend → tables let an operator drill into offers/purchases/grants.
 * FIRST VIEWPOINT: 1440px operator desktop, Overview tab, prod environment,
 * "week" period — KPI row and the two lead charts above the fold.
 * FORM: sidebar nav + stat-card row + chart pair + data tables — the v0
 * reference's operational grammar, but flat (no card elevation/blur) and in
 * this product's rose-on-near-black palette, never the reference's palette.
 */
import { useEffect, useState } from "react";
import { Login } from "./Login";
import { DualLineChart, LineChart } from "./charts";
import {
  api,
  ApiError,
  type AdminStats,
  type DashEnvId,
  type DailySeriesPoint,
  type DashSession,
  type GrantHistoryRecord,
  type Offer,
  type RecentPurchaseRow,
  type StatsPeriod,
} from "./api";

type Tab = "overview" | "offers" | "purchases" | "grants" | "attribution";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "offers", label: "Офферы" },
  { id: "purchases", label: "Покупки" },
  { id: "grants", label: "Начисления" },
  { id: "attribution", label: "Источники" },
];

const PERIODS: { id: StatsPeriod; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "all", label: "Всё время" },
];

function fmtNum(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = { paid: "оплачено", pending: "ожидание", canceled: "отменено" };

export function App() {
  const [session, setSession] = useState<DashSession | null | "loading">("loading");

  useEffect(() => {
    api.me().then(setSession).catch(() => setSession(null));
  }, []);

  if (session === "loading") {
    return <div className="state-block state-block-fullscreen"><div className="spinner" /></div>;
  }
  if (!session) {
    return <Login onLoggedIn={() => api.me().then(setSession).catch(() => setSession(null))} />;
  }
  return <Dashboard session={session} onLoggedOut={() => setSession(null)} />;
}

function Dashboard({ session, onLoggedOut }: { session: DashSession; onLoggedOut: () => void }) {
  const [envId, setEnvId] = useState<DashEnvId>("prod");
  const [envAvailable, setEnvAvailable] = useState<{ prod: boolean; dev: boolean }>({ prod: true, dev: true });
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    api.environments().then(setEnvAvailable).catch(() => {});
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          agent-music
          <small>операторская панель</small>
        </div>
        {TABS.map((t) => (
          <button key={t.id} className={`nav-item${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            <span className="dot" />
            {t.label}
          </button>
        ))}
        <div className="sidebar-foot">
          <div className="who">
            Вы: <b>{session.username ? `@${session.username}` : session.chatId}</b>
          </div>
          <button
            className="logout-btn"
            onClick={() => {
              api.logout().finally(onLoggedOut);
            }}
          >
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="page-title">{TABS.find((t) => t.id === tab)?.label}</div>
          <div className="controls">
            <div className="period-select">
              {PERIODS.map((p) => (
                <button key={p.id} className={period === p.id ? "active" : ""} onClick={() => setPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="env-switch">
              <button className={envId === "prod" ? "active" : ""} onClick={() => setEnvId("prod")} title={envAvailable.prod ? "прод доступен" : "прод недоступен"}>
                <span className={`env-dot${envAvailable.prod ? "" : " off"}`} />
                prod{!envAvailable.prod && <span className="env-off-label"> · нет связи</span>}
              </button>
              <button className={envId === "dev" ? "active" : ""} onClick={() => setEnvId("dev")} title={envAvailable.dev ? "dev доступен" : "dev недоступен"}>
                <span className={`env-dot${envAvailable.dev ? "" : " off"}`} />
                dev{!envAvailable.dev && <span className="env-off-label"> · нет связи</span>}
              </button>
            </div>
          </div>
        </div>

        {tab === "overview" && <Overview envId={envId} period={period} />}
        {tab === "offers" && <OffersTab envId={envId} />}
        {tab === "purchases" && <PurchasesTab envId={envId} />}
        {tab === "grants" && <GrantsTab envId={envId} />}
        {tab === "attribution" && <AttributionTab envId={envId} period={period} />}
      </main>
    </div>
  );
}

// ---------- data-fetch hook ----------

function useEnvData<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e) => !cancelled && setState({ data: null, error: e instanceof ApiError ? e.message : "Ошибка загрузки", loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function StateGuard({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: React.ReactNode }) {
  if (loading) return <div className="state-block"><div className="spinner" />Загрузка…</div>;
  if (error) return <div className="error-block">{error}</div>;
  if (empty) return <div className="state-block">Нет данных за выбранный период.</div>;
  return <>{children}</>;
}

// ---------- Overview ----------

function Overview({ envId, period }: { envId: DashEnvId; period: StatsPeriod }) {
  const stats = useEnvData<AdminStats>(() => api.stats(envId, period), [envId, period]);
  const series = useEnvData<{ series: DailySeriesPoint[] }>(() => api.series(envId, 30), [envId]);

  return (
    <div>
      <StateGuard loading={stats.loading} error={stats.error}>
        {stats.data && <Kpis stats={stats.data} />}
      </StateGuard>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">
            Новые пользователи и генерации <span className="hint">30 дней</span>
          </div>
          <StateGuard loading={series.loading} error={series.error}>
            {series.data && (
              <DualLineChart
                a={series.data.series.map((p) => p.newUsers)}
                b={series.data.series.map((p) => p.generations)}
                labelA="Новые пользователи"
                labelB="Генерации"
              />
            )}
          </StateGuard>
        </div>
        <div className="panel">
          <div className="panel-title">
            Выручка (сумма по всем валютам) <span className="hint">30 дней</span>
          </div>
          <StateGuard loading={series.loading} error={series.error}>
            {series.data && (
              <LineChart points={series.data.series.map((p) => p.revenue)} formatValue={(v) => fmtNum(v)} />
            )}
          </StateGuard>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Воронка (когорта привлечения за период)</div>
          <StateGuard loading={stats.loading} error={stats.error}>
            {stats.data && <Funnel stats={stats.data} />}
          </StateGuard>
        </div>
        <div className="panel">
          <div className="panel-title">Сегменты пользователей</div>
          <StateGuard loading={stats.loading} error={stats.error}>
            {stats.data && <Segments stats={stats.data} />}
          </StateGuard>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Топ офферов и активных пользователей за период</div>
        <StateGuard loading={stats.loading} error={stats.error}>
          {stats.data && (
            <div className="grid-2 grid-2-flush">
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Оффер</th><th>Продаж</th></tr></thead>
                  <tbody>
                    {stats.data.topOffers.length === 0 && <tr><td colSpan={2} className="muted">нет продаж</td></tr>}
                    {stats.data.topOffers.map((o, i) => (
                      <tr key={i}><td>{o.title}</td><td>{o.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Пользователь</th><th>Генераций</th></tr></thead>
                  <tbody>
                    {stats.data.topActiveUsers.length === 0 && <tr><td colSpan={2} className="muted">нет активности</td></tr>}
                    {stats.data.topActiveUsers.map((u) => (
                      <tr key={u.chatId}><td>{u.username ? `@${u.username}` : u.chatId}</td><td>{u.generations}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </StateGuard>
      </div>
    </div>
  );
}

function Kpis({ stats }: { stats: AdminStats }) {
  const revenueTotal = stats.revenue.reduce((s, r) => s + r.total, 0);
  return (
    <div className="kpi-row">
      <div className="kpi-card">
        <div className="kpi-label">Всего пользователей</div>
        <div className="kpi-value">{fmtNum(stats.totalUsers)}</div>
        <div className="kpi-sub positive">+{fmtNum(stats.newUsers)} за период</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Активные подписки</div>
        <div className="kpi-value">{fmtNum(stats.activeSubscriptions)}</div>
        <div className="kpi-sub">сейчас</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Оплаченные покупки</div>
        <div className="kpi-value">{fmtNum(stats.paidPurchases)}</div>
        <div className="kpi-sub">за период</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Выручка за период</div>
        <div className="kpi-value">{fmtNum(revenueTotal)}</div>
        <div className="kpi-sub">{stats.revenue.map((r) => `${fmtNum(r.total)} ${r.asset}`).join(" · ") || "—"}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Конверсия в покупку</div>
        <div className="kpi-value">{fmtPct(stats.conversionRate)}</div>
        <div className="kpi-sub">от привлечённой когорты</div>
      </div>
    </div>
  );
}

function Funnel({ stats }: { stats: AdminStats }) {
  const labels: Record<AdminStats["funnel"][number]["event"], string> = {
    acquired: "Привлечены",
    miniapp_opened: "Открыли Mini App",
    generation_started: "Начали генерацию",
    generation_completed: "Получили плейлист",
    checkout_started: "Открыли оплату",
    purchase_completed: "Оплатили",
  };
  const max = stats.funnel[0]?.users || 1;
  return (
    <div className="funnel">
      {stats.funnel.map((step) => (
        <div className="funnel-row" key={step.event}>
          <div className="funnel-label">{labels[step.event]}</div>
          <div className="funnel-bar-track">
            <div className="funnel-bar-fill" style={{ width: `${Math.max(2, (step.users / max) * 100)}%` }} />
          </div>
          <div className="funnel-pct">{fmtNum(step.users)}</div>
        </div>
      ))}
    </div>
  );
}

function Segments({ stats }: { stats: AdminStats }) {
  const rows: [string, number][] = [
    ["Активная подписка", stats.segments.activeSubscription],
    ["Активный триал", stats.segments.trialActive],
    ["Платили, без подписки", stats.segments.payingNoSubscription],
    ["Бесплатные, без активности", stats.segments.freeNoActivity],
  ];
  const total = rows.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="funnel">
      {rows.map(([label, n]) => (
        <div className="funnel-row" key={label}>
          <div className="funnel-label">{label}</div>
          <div className="funnel-bar-track">
            <div className="funnel-bar-fill" style={{ width: `${Math.max(2, (n / total) * 100)}%` }} />
          </div>
          <div className="funnel-pct">{fmtNum(n)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Offers ----------

function OffersTab({ envId }: { envId: DashEnvId }) {
  const offers = useEnvData<{ offers: Offer[] }>(() => api.offers(envId), [envId]);
  return (
    <div className="panel">
      <div className="panel-title">Офферы</div>
      <StateGuard loading={offers.loading} error={offers.error} empty={offers.data?.offers.length === 0}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Название</th><th>Статус</th><th>Цена</th><th>Stars</th><th>RUB</th><th>Даёт</th>
              </tr>
            </thead>
            <tbody>
              {offers.data?.offers.map((o) => (
                <tr key={o.id}>
                  <td>{o.icon ? `${o.icon} ` : ""}{o.title}</td>
                  <td><span className={`pill ${o.active ? "active" : "inactive"}`}>{o.active ? "активен" : "выключен"}</span></td>
                  <td className="mono">{o.amount} {o.asset}</td>
                  <td className="mono">{o.starsAmount ?? "—"}</td>
                  <td className="mono">{o.rubAmount ?? "—"}</td>
                  <td>{o.grantKind === "credits" ? `${o.grantAmount} кредитов` : `${o.grantAmount} дней подписки`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateGuard>
    </div>
  );
}

// ---------- Purchases ----------

function PurchasesTab({ envId }: { envId: DashEnvId }) {
  const purchases = useEnvData<{ purchases: RecentPurchaseRow[] }>(() => api.purchases(envId, 50), [envId]);
  return (
    <div className="panel">
      <div className="panel-title">Последние покупки <span className="hint">до 50 записей</span></div>
      <StateGuard loading={purchases.loading} error={purchases.error} empty={purchases.data?.purchases.length === 0}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Дата</th><th>Пользователь</th><th>Оффер</th><th>Сумма</th><th>Провайдер</th><th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {purchases.data?.purchases.map((p) => (
                <tr key={p.id}>
                  <td className="muted">{fmtDate(p.createdAt)}</td>
                  <td>{p.username ? `@${p.username}` : p.chatId}</td>
                  <td>{p.offerTitle ?? "—"}</td>
                  <td className="mono">{p.amount} {p.asset}</td>
                  <td className="muted">{p.provider}</td>
                  <td><span className={`pill ${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateGuard>
    </div>
  );
}

// ---------- Grants ----------

function GrantsTab({ envId }: { envId: DashEnvId }) {
  const grants = useEnvData<{ history: GrantHistoryRecord[]; total: number }>(() => api.grantHistory(envId, 50), [envId]);
  const typeLabel: Record<GrantHistoryRecord["type"], string> = {
    credits: "кредиты",
    subscription: "подписка",
    subscription_revoked: "подписка отозвана",
  };
  return (
    <div className="panel">
      <div className="panel-title">
        История начислений <span className="hint">{grants.data ? `всего ${fmtNum(grants.data.total)}` : ""}</span>
      </div>
      <StateGuard loading={grants.loading} error={grants.error} empty={grants.data?.history.length === 0}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Дата</th><th>Пользователь</th><th>Тип</th><th>Кол-во</th><th>Кем выдано</th></tr></thead>
            <tbody>
              {grants.data?.history.map((g) => (
                <tr key={g.id}>
                  <td className="muted">{fmtDate(g.createdAt)}</td>
                  <td className="mono">{g.chatId}</td>
                  <td>{typeLabel[g.type]}</td>
                  <td className="mono">{g.amount}</td>
                  <td className="mono">{g.grantedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateGuard>
    </div>
  );
}

// ---------- Attribution ----------

function AttributionTab({ envId, period }: { envId: DashEnvId; period: StatsPeriod }) {
  const stats = useEnvData<AdminStats>(() => api.stats(envId, period), [envId, period]);
  return (
    <div>
      <div className="panel panel-stacked">
        <div className="panel-title">Источники трафика</div>
        <StateGuard loading={stats.loading} error={stats.error} empty={stats.data?.trafficSources.length === 0}>
          <AttributionTable rows={stats.data?.trafficSources ?? []} />
        </StateGuard>
      </div>
      <div className="panel">
        <div className="panel-title">UTM-кампании</div>
        <StateGuard loading={stats.loading} error={stats.error} empty={stats.data?.utmCampaigns.length === 0}>
          <AttributionTable rows={stats.data?.utmCampaigns ?? []} showCampaign />
        </StateGuard>
      </div>
    </div>
  );
}

function AttributionTable({ rows, showCampaign }: { rows: AdminStats["trafficSources"]; showCampaign?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Источник</th>
            <th>Канал</th>
            {showCampaign && <th>Кампания</th>}
            <th>Пользователи</th>
            <th>Плательщики</th>
            <th>Конверсия</th>
            <th>Выручка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.source}</td>
              <td className="muted">{r.medium ?? "—"}</td>
              {showCampaign && <td className="muted">{r.campaign ?? "—"}</td>}
              <td>{fmtNum(r.users)}</td>
              <td>{fmtNum(r.payers)}</td>
              <td>{fmtPct(r.conversionRate)}</td>
              <td className="mono">{r.revenue.map((rv) => `${fmtNum(rv.total)} ${rv.asset}`).join(" · ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
