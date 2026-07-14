import { useEffect, useState } from "react";
import {
  Package, Plus, Wallet, Calendar, Receipt, User,
  Play, Pause, CircleNotch, WarningCircle, Gift, Star,
  ArrowsClockwise, CaretDown, CaretUp, DownloadSimple, MusicNotes, Trash,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { usePlayer } from "../lib/player";
import { api, type MeResponse, type ShopConfig, type Invoice, type DownloadRecord, type DownloadStatus } from "../lib/api";

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

const DOWNLOAD_STATUS_LABEL: Record<DownloadStatus, string> = {
  pending: "в очереди",
  processing: "отправляется…",
  done: "готово",
  partial: "частично",
  failed: "ошибка",
};



function DownloadEntry({
  record,
  onResend,
  onDelete,
  onDeleteInitiate,
  busy,
  confirming,
}: {
  record: DownloadRecord;
  onResend: () => void;
  onDelete: () => void;
  onDeleteInitiate?: () => void;
  busy: "resend" | "delete" | null;
  confirming?: boolean;
}) {
  const player = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const active = record.status === "pending" || record.status === "processing";

  return (
    <li className="download-entry">
      <div className="download-entry-inner">
        <MusicNotes size={18} weight="bold" />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
          aria-expanded={expanded}
        >
          <p style={{ fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {record.playlistName}
          </p>
          <p className="text-muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
            {new Date(record.createdAt * 1000).toLocaleDateString("ru-RU")} · {record.tracks.length} тр. ·{" "}
            {DOWNLOAD_STATUS_LABEL[record.status]}
          </p>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className="action-btn"
            aria-label="Скачать ещё раз"
            title="Скачать ещё раз"
            disabled={busy !== null || active}
            onClick={onResend}
          >
            {busy === "resend" ? <CircleNotch size={18} className="spin" /> : <ArrowsClockwise size={18} weight="regular" />}
          </button>
          {confirming ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button type="button" className="action-btn action-btn--destructive" onClick={onDelete} disabled={busy !== null}>
                {busy === "delete" ? <CircleNotch size={18} className="spin" /> : <>✓</>}
              </button>
              <button type="button" className="action-btn" onClick={onDeleteInitiate}>
                ✕
              </button>
            </div>
          ) : (
          <button
            type="button"
            className="action-btn action-btn--destructive"
            aria-label="Удалить из истории"
            title="Удалить из истории"
            disabled={busy !== null}
            onClick={onDeleteInitiate}
          >
            {busy === "delete" ? <CircleNotch size={18} className="spin" /> : <Trash size={18} weight="regular" />}
          </button>
          )}
        </div>
        <button
          type="button"
          className="action-btn action-btn--neutral"
          aria-label={expanded ? "Свернуть" : "Показать треки"}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <CaretUp size={16} weight="regular" /> : <CaretDown size={16} weight="regular" />}
        </button>
      </div>
      {expanded && (
        <ul className="download-entry-tracks">
          {record.tracks.map((t) => {
            const isActive = player.track?.uri === t.uri;
            const status = isActive ? player.status : "idle";
            return (
              <li key={t.uri} className="download-track" onClick={() => {
                player.setQueue(
                  record.tracks.map((rt) => ({ uri: rt.uri, title: rt.title, artist: rt.artist }))
                );
                player.toggle({ uri: t.uri, title: t.title, artist: t.artist });
              }}>
                {status === "playing" ? (
                  <Pause size={14} weight="fill" style={{ flexShrink: 0, color: "var(--accent)" }} />
                ) : (
                  <Play size={14} weight="fill" style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.artist} — {t.title}
                </span>
                  {t.status === "failed" && (
                    <WarningCircle size={12} weight="bold" className="text-muted" aria-label={`Ошибка: ${t.error}`} />
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function DownloadsSection({ refreshKey }: { refreshKey: number }) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<{ id: number; kind: "resend" | "delete" } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const polling = { active: true };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function fetchAndSchedule() {
      try {
        const r = await api.downloads();
        if (!polling.active) return;
        setDownloads(r.downloads);
        setError(null);
        const hasActive = r.downloads.some((d) => d.status === "pending" || d.status === "processing");
        if (hasActive && polling.active) {
          timeoutId = setTimeout(fetchAndSchedule, 5000);
        }
      } catch (e) {
        if (!polling.active) return;
        setError(e instanceof Error ? e.message : String(e));
        if (polling.active) {
          timeoutId = setTimeout(fetchAndSchedule, 5000);
        }
      }
    }

    fetchAndSchedule();

    return () => {
      polling.active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [refreshKey]);

  async function handleResend(record: DownloadRecord) {
    setBusyId({ id: record.id, kind: "resend" });
    setError(null);
    setNotice(null);
    try {
      await api.resendDownload(record.id);
      setNotice(`«${record.playlistName}» отправляется в чат`);
      const r = await api.downloads();
      setDownloads(r.downloads);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(record: DownloadRecord) {
    setBusyId({ id: record.id, kind: "delete" });
    setError(null);
    setConfirmDeleteId(null);
    const previous = downloads;
    setDownloads((list) => list.filter((d) => d.id !== record.id));
    try {
      await api.deleteDownload(record.id);
    } catch (e) {
      setDownloads(previous);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error && <p role="alert" style={{ display: "flex", alignItems: "center", gap: 6 }}><WarningCircle size={16} weight="bold" /> {error}</p>}
      {notice && <p role="status" style={{ display: "flex", alignItems: "center", gap: 6 }}><DownloadSimple size={16} weight="bold" /> {notice}</p>}
      {downloads.length === 0 ? (
        <EmptyState icon={<DownloadSimple size={40} weight="bold" />} label="Загрузок пока нет" />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
          {downloads.map((d) => (
            <DownloadEntry
              key={d.id}
              record={d}
              busy={busyId?.id === d.id ? busyId.kind : null}
              confirming={confirmDeleteId === d.id}
              onResend={() => handleResend(d)}
              onDelete={() => handleDelete(d)}
              onDeleteInitiate={() => setConfirmDeleteId(confirmDeleteId === d.id ? null : d.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

type ProfileTab = "Покупки" | "Загрузки";

export default function ProfileScreen({ me, shopConfig, onGoShop }: { me: MeResponse | null; shopConfig: ShopConfig | null; onGoShop: () => void }) {
  const [purchases, setPurchases] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("Покупки");
  const [downloadsRefresh, setDownloadsRefresh] = useState(0);

  useEffect(() => {
    api.purchases()
      .then((p) => setPurchases(p.purchases.filter((i) => i.status === "paid")))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    function onDownloadCreated() {
      setDownloadsRefresh((n) => n + 1);
    }
    window.addEventListener("download-created", onDownloadCreated);
    return () => window.removeEventListener("download-created", onDownloadCreated);
  }, []);

  return (
    <div className="stack">
      <GlassPanel className="reveal">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          {me?.photoUrl ? (
            <img src={me.photoUrl} alt="" className="profile-avatar" />
          ) : (
            <span className="profile-avatar-placeholder" aria-hidden="true">
              <User size={20} weight="bold" style={{ color: "var(--text-secondary)" }} />
            </span>
          )}
          <div>
            <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>{displayName(me)}</p>
            <p className="text-muted" style={{ fontSize: 13, margin: "2px 0 0" }}>
              ◉ {shopConfig?.headerTitle || "agent music"}
            </p>
          </div>
        </div>

        <div className="section-label">АККАУНТ</div>
        <div className="profile-stats">
          <div className="stack" style={{ gap: 4 }}>
            <span className="text-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <Wallet size={15} weight="bold" /> Баланс
            </span>
            <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
              {me?.credits ?? 0} ген
            </span>
            {me?.trial.active && (
              <span className="text-muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Gift size={12} weight="bold" /> {me.trial.creditsLeft} ген. до{" "}
                {new Date((me.trial.until ?? 0) * 1000).toLocaleDateString("ru-RU")}
              </span>
            )}
            <span className="text-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <Calendar size={13} weight="bold" /> Подписка: {formatSubscription(me?.subscriptionUntil ?? null)}
            </span>
          </div>
          <button type="button" className="glass-button primary" onClick={onGoShop}
            style={{ height: "auto", alignSelf: "stretch", fontSize: 14, padding: "0 16px" }}>
            <Plus size={18} weight="bold" />
            Пополнить
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="reveal">
        <div className="section-label">ИСТОРИЯ</div>
        <div className="mt-12" style={{ marginBottom: 14 }}>
          <Segmented<ProfileTab>
            options={["Покупки", "Загрузки"] as const}
            value={tab}
            onChange={(t) => {
              setTab(t);
              if (t === "Загрузки") setDownloadsRefresh((n) => n + 1);
            }}
            ariaLabel="История"
          />
        </div>
        {tab === "Загрузки" ? (
          <DownloadsSection refreshKey={downloadsRefresh} />
        ) : (
          <>
        {error && <p role="alert" style={{ display: "flex", alignItems: "center", gap: 6 }}><WarningCircle size={16} weight="bold" /> {error}</p>}
        {purchases.length === 0 ? (
          <EmptyState
            icon={<Package size={40} weight="bold" />}
            label="Покупок пока нет"
            action={{ label: "В магазин", onClick: onGoShop }}
          />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {purchases.map((p) => (
              <li key={p.id} className="purchase-item">
                <Receipt size={18} weight="bold" />
                <span style={{ flex: 1 }}>
                  #{p.id} · {p.amount} {p.asset === "XTR" ? <Star size={12} weight="fill" /> : p.asset}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {new Date(p.createdAt * 1000).toLocaleDateString("ru-RU")}
                </span>
              </li>
            ))}
          </ul>
        )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}
