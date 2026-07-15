import { useEffect, useState } from "react";
import {
  Package, Plus, Wallet, Calendar, Receipt, User,
  Play, Pause, CircleNotch, WarningCircle, Gift, Star,
  ArrowsClockwise, CaretDown, CaretUp, DownloadSimple, MusicNotes, Trash,
  Check, X, BookmarkSimple,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { Segmented } from "../components/Segmented";
import { EmptyState } from "../components/EmptyState";
import { usePlayer } from "../lib/player";
import { api, type MeResponse, type Invoice, type DownloadRecord, type DownloadStatus, type HistoryEntry } from "../lib/api";

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
            <span
              className={
                record.status === "failed" ? "text-danger" : record.status === "done" ? "text-success" : undefined
              }
            >
              {DOWNLOAD_STATUS_LABEL[record.status]}
            </span>
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
              <button type="button" className="action-btn action-btn--destructive" aria-label="Подтвердить удаление" onClick={onDelete} disabled={busy !== null}>
                {busy === "delete" ? <CircleNotch size={18} className="spin" /> : <Check size={18} weight="bold" />}
              </button>
              <button type="button" className="action-btn" aria-label="Отменить удаление" onClick={onDeleteInitiate}>
                <X size={18} weight="bold" />
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
              <li
                key={t.uri}
                className="download-track"
                role="button"
                tabIndex={0}
                onClick={() => {
                  player.toggle(
                    { uri: t.uri, title: t.title, artist: t.artist },
                    record.tracks.map((rt) => ({ uri: rt.uri, title: rt.title, artist: rt.artist })),
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  player.toggle(
                    { uri: t.uri, title: t.title, artist: t.artist },
                    record.tracks.map((rt) => ({ uri: rt.uri, title: rt.title, artist: rt.artist })),
                  );
                }}
              >
                {status === "playing" ? (
                  <Pause size={14} weight="fill" style={{ flexShrink: 0, color: "var(--accent)" }} />
                ) : (
                  <Play size={14} weight="fill" style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.artist} — {t.title}
                </span>
                  {t.status === "failed" && (
                    <WarningCircle size={12} weight="bold" className="text-danger" aria-label={`Ошибка: ${t.error}`} />
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

type LibraryItem =
  | { kind: "download"; createdAt: number; record: DownloadRecord }
  | { kind: "history"; createdAt: number; entry: HistoryEntry };

function HistoryItem({ entry, onOpen }: { entry: HistoryEntry; onOpen: (entry: HistoryEntry) => void }) {
  return (
    <li className="download-entry">
      <button
        type="button"
        className="download-entry-inner"
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "inherit", cursor: "pointer" }}
        onClick={() => onOpen(entry)}
      >
        <BookmarkSimple size={18} weight="bold" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.playlistName ?? entry.prompt}
          </p>
          <p className="text-muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
            {new Date(entry.createdAt * 1000).toLocaleDateString("ru-RU")} · {entry.trackCount ?? entry.tracks.length} тр.
          </p>
        </div>
      </button>
    </li>
  );
}

function LibrarySection({
  refreshKey,
  onOpen,
}: {
  refreshKey: number;
  onOpen: (entry: HistoryEntry) => void;
}) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<{ id: number; kind: "resend" | "delete" } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    api.fetchHistory()
      .then((r) => setHistory(r.history))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refreshKey]);

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

  const items: LibraryItem[] = [
    ...downloads.map((record): LibraryItem => ({ kind: "download", createdAt: record.createdAt, record })),
    ...history.map((entry): LibraryItem => ({ kind: "history", createdAt: entry.createdAt, entry })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      {error && <p role="alert" className="icon-row"><WarningCircle size={16} weight="bold" /> {error}</p>}
      {notice && <p role="status" className="icon-row"><DownloadSimple size={16} weight="bold" /> {notice}</p>}
      {items.length === 0 ? (
        <EmptyState icon={<BookmarkSimple size={40} weight="bold" />} label="Пока пусто. Здесь появятся закладки и загрузки" />
      ) : (
        <ul className="plain-list plain-list--col">
          {items.map((item) =>
            item.kind === "download" ? (
              <DownloadEntry
                key={`d-${item.record.id}`}
                record={item.record}
                busy={busyId?.id === item.record.id ? busyId.kind : null}
                confirming={confirmDeleteId === item.record.id}
                onResend={() => handleResend(item.record)}
                onDelete={() => handleDelete(item.record)}
                onDeleteInitiate={() => setConfirmDeleteId(confirmDeleteId === item.record.id ? null : item.record.id)}
              />
            ) : (
              <HistoryItem key={`h-${item.entry.id}`} entry={item.entry} onOpen={onOpen} />
            ),
          )}
        </ul>
      )}
    </>
  );
}

type ProfileTab = "Покупки" | "Библиотека";

const MUSIC_BACKENDS = ["youtube-music", "soundcloud"] as const;
type MusicBackendId = (typeof MUSIC_BACKENDS)[number];

function MusicBackendPicker({ me }: { me: MeResponse | null }) {
  const [backend, setBackend] = useState<MusicBackendId>(
    (me?.musicBackend as MusicBackendId | null) ?? "youtube-music",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me?.musicBackend) setBackend(me.musicBackend as MusicBackendId);
  }, [me?.musicBackend]);

  async function handleChange(id: MusicBackendId) {
    const previous = backend;
    setBackend(id);
    setSaving(true);
    try {
      await api.setMyMusicBackend(id);
    } catch {
      setBackend(previous);
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
        options={MUSIC_BACKENDS}
        value={backend}
        onChange={handleChange}
      />
      {saving && <CircleNotch size={14} className="spin" style={{ marginLeft: 8 }} />}
    </div>
  );
}

export default function ProfileScreen({
  me,
  onGoShop,
  onOpenHistory,
}: {
  me: MeResponse | null;
  onGoShop: () => void;
  onOpenHistory: (entry: HistoryEntry) => void;
}) {
  const [purchases, setPurchases] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("Покупки");
  const [downloadsRefresh, setDownloadsRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);

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
              <User size={20} weight="bold" style={{ color: "var(--text-muted-dark)" }} />
            </span>
          )}
          <div>
            <p style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em", margin: 0 }}>{displayName(me)}</p>
          </div>
        </div>

        <div className="profile-stats">
          <div className="stack" style={{ gap: 4 }}>
            <span className="text-muted icon-row" style={{ fontSize: 12 }}>
              <Wallet size={13} weight="bold" /> Баланс
            </span>
            <span style={{ fontSize: 38, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              {me?.credits ?? 0} <span style={{ fontSize: 18, fontWeight: 700 }}>ген</span>
            </span>
            {me?.trial.active && (
              <span className="text-muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Gift size={12} weight="bold" /> {me.trial.creditsLeft} ген. до{" "}
                {new Date((me.trial.until ?? 0) * 1000).toLocaleDateString("ru-RU")}
              </span>
            )}
            <span className="text-muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
              Потрачено: {me?.generationsUsed ?? 0} ген
            </span>
            <span className="text-muted icon-row" style={{ fontSize: 12 }}>
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
      </GlassPanel>

      <GlassPanel className="reveal">
        <div style={{ marginBottom: 14 }}>
          <Segmented<ProfileTab>
            options={["Покупки", "Библиотека"] as const}
            value={tab}
            onChange={(t) => {
              setTab(t);
              if (t === "Библиотека") {
                setDownloadsRefresh((n) => n + 1);
                setHistoryRefresh((n) => n + 1);
              }
            }}
            ariaLabel="Библиотека"
          />
        </div>
        {tab === "Библиотека" ? (
          <LibrarySection refreshKey={downloadsRefresh + historyRefresh} onOpen={onOpenHistory} />
        ) : (
          <>
        {error && <p role="alert" className="icon-row"><WarningCircle size={16} weight="bold" /> {error}</p>}
        {purchases.length === 0 ? (
          <EmptyState
            icon={<Package size={40} weight="bold" />}
            label="Покупок пока нет"
            action={{ label: "В магазин", onClick: onGoShop }}
          />
        ) : (
          <ul className="plain-list plain-list--col-gap">
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
