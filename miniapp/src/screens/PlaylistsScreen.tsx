import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  MusicNotes, Trash, CircleNotch,
  Play, Pause, WarningCircle, ListPlus,
  ArrowsClockwise, CaretDown, CaretUp, DownloadSimple,
  Check, X, BookmarkSimple, ArrowLeft, Plus, PencilSimple, Playlist as PlaylistIcon, Sparkle,
} from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { EmptyState } from "../components/EmptyState";
import { TrackRow } from "../components/TrackRow";
import { TrackOverflowMenu } from "../components/TrackOverflowMenu";
import { requestAddToPlaylist } from "../components/AddToPlaylistButton";
import { usePlayer } from "../lib/player";
import { openStarsInvoice } from "../lib/telegram";
import {
  api,
  PlaylistLimitReachedError,
  type SavedTrack,
  type DownloadRecord,
  type DownloadStatus,
  type HistoryEntry,
  type Playlist,
  type PlaylistDetail,
} from "../lib/api";

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
  busy,
  style,
}: {
  record: DownloadRecord;
  onResend: () => void;
  onDelete: () => void;
  busy: "resend" | "delete" | null;
  style?: CSSProperties;
}) {
  const player = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const active = record.status === "pending" || record.status === "processing";
  const queue = record.tracks.map((rt) => ({ uri: rt.uri, title: rt.title, artist: rt.artist }));

  return (
    <li style={{ listStyle: "none" }}>
      <TrackRow
        style={style}
        ariaExpanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        fallbackIcon={<MusicNotes size={20} weight="bold" />}
        title={record.playlistName}
        metaClassName="search-row-meta"
        meta={
          <>
            {new Date(record.createdAt * 1000).toLocaleDateString("ru-RU")} · {record.tracks.length} тр. ·{" "}
            <span
              className={
                record.status === "failed"
                  ? "text-danger"
                  : record.status === "done"
                    ? "text-success"
                    : "text-warning"
              }
            >
              {DOWNLOAD_STATUS_LABEL[record.status]}
            </span>
          </>
        }
        trailing={
          <>
            {busy !== null && <CircleNotch size={16} className="spin" style={{ color: "var(--text-muted)" }} />}
            <button
              type="button"
              className="icon-btn track-download-btn"
              aria-label={expanded ? "Свернуть" : "Показать треки"}
              title={expanded ? "Свернуть" : "Показать треки"}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? <CaretUp size={18} /> : <CaretDown size={18} />}
            </button>
            <TrackOverflowMenu
              actions={[
                {
                  key: "resend",
                  label: "Скачать ещё раз",
                  icon: <ArrowsClockwise size={18} />,
                  disabled: busy !== null || active,
                  onClick: onResend,
                },
                {
                  key: "delete",
                  label: "Удалить из истории",
                  icon: <Trash size={18} />,
                  disabled: busy !== null,
                  destructive: true,
                  onClick: onDelete,
                },
              ]}
            />
          </>
        }
      />
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
                  player.toggle({ uri: t.uri, title: t.title, artist: t.artist }, queue);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  player.toggle({ uri: t.uri, title: t.title, artist: t.artist }, queue);
                }}
              >
                {status === "playing" ? (
                  <Pause size={14} weight="fill" style={{ flexShrink: 0, color: "var(--accent)" }} />
                ) : (
                  <Play size={14} weight="fill" style={{ flexShrink: 0 }} />
                )}
                <span className="fs-label" style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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

function HistoryItem({
  entry,
  onOpen,
  style,
}: {
  entry: HistoryEntry;
  onOpen: (entry: HistoryEntry) => void;
  style?: CSSProperties;
}) {
  const artwork = entry.tracks.find((t) => t.artwork)?.artwork;
  return (
    <li style={{ listStyle: "none" }}>
      <TrackRow
        style={style}
        onClick={() => onOpen(entry)}
        artwork={artwork}
        fallbackIcon={<BookmarkSimple size={20} weight="bold" />}
        title={entry.playlistName ?? entry.prompt}
        metaClassName="search-row-meta"
        meta={`${new Date(entry.createdAt * 1000).toLocaleDateString("ru-RU")} · ${entry.trackCount ?? entry.tracks.length} тр.`}
      />
    </li>
  );
}

const PLAYLIST_COVER_PALETTES = [
  ["#ff6f91", "#7247d9", "#15162a"],
  ["#ff9a62", "#c93672", "#24152b"],
  ["#68d5c8", "#2472a4", "#111d31"],
  ["#f5c85b", "#e75d55", "#2e1930"],
] as const;

function PlaylistCover({ playlistId }: { playlistId: number }) {
  const palette = PLAYLIST_COVER_PALETTES[Math.abs(playlistId) % PLAYLIST_COVER_PALETTES.length]!;
  return (
    <span
      className="playlist-cover-art"
      aria-hidden="true"
      style={{
        ["--cover-a" as string]: palette[0],
        ["--cover-b" as string]: palette[1],
        ["--cover-c" as string]: palette[2],
      }}
    />
  );
}

function LibrarySection({ onOpen }: { onOpen: (entry: HistoryEntry) => void }) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<{ id: number; kind: "resend" | "delete" } | null>(null);

  useEffect(() => {
    api.fetchHistory()
      .then((r) => setHistory(r.history))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

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
  }, []);

  useEffect(() => {
    function onDownloadCreated() {
      api.downloads().then((r) => setDownloads(r.downloads)).catch(() => {});
    }
    window.addEventListener("download-created", onDownloadCreated);
    return () => window.removeEventListener("download-created", onDownloadCreated);
  }, []);

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

  const items: LibraryItem[] = useMemo(
    () =>
      [
        ...downloads.map((record): LibraryItem => ({ kind: "download", createdAt: record.createdAt, record })),
        ...history.map((entry): LibraryItem => ({ kind: "history", createdAt: entry.createdAt, entry })),
      ].sort((a, b) => b.createdAt - a.createdAt),
    [downloads, history],
  );

  return (
    <>
      {error && <p role="alert" className="icon-row"><WarningCircle size={16} weight="bold" /> {error}</p>}
      {notice && <p role="status" className="icon-row"><DownloadSimple size={16} weight="bold" /> {notice}</p>}
      {items.length === 0 ? (
        <EmptyState icon={<BookmarkSimple size={40} weight="bold" />} label="Пока пусто. Здесь появятся закладки и загрузки" />
      ) : (
        <ul className="plain-list plain-list--col reveal-stagger">
          {items.map((item, i) =>
            item.kind === "download" ? (
              <DownloadEntry
                key={`d-${item.record.id}`}
                record={item.record}
                busy={busyId?.id === item.record.id ? busyId.kind : null}
                onResend={() => handleResend(item.record)}
                onDelete={() => handleDelete(item.record)}
                style={{ ["--i" as string]: i }}
              />
            ) : (
              <HistoryItem key={`h-${item.entry.id}`} entry={item.entry} onOpen={onOpen} style={{ ["--i" as string]: i }} />
            ),
          )}
        </ul>
      )}
    </>
  );
}

/** User playlists list: create (with slot limit + Stars purchase) and open a playlist's detail. */
function PlaylistsSection({ onOpen }: { onOpen: (id: number) => void }) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [limitPrompt, setLimitPrompt] = useState<{ starsPrice: number } | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);

  function load() {
    api.playlists().then((r) => setPlaylists(r.playlists)).catch(() => setPlaylists([]));
  }

  useEffect(load, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || createBusy) return;
    setCreateBusy(true);
    try {
      const { playlist } = await api.createPlaylist(name);
      setPlaylists((prev) => [playlist, ...(prev ?? [])]);
      setNewName("");
      setCreating(false);
    } catch (e) {
      if (e instanceof PlaylistLimitReachedError) setLimitPrompt({ starsPrice: e.starsPrice });
    } finally {
      setCreateBusy(false);
    }
  }

  async function buySlot() {
    setBuyBusy(true);
    try {
      const { payUrl } = await api.buyPlaylistSlots(1);
      openStarsInvoice(payUrl, (status) => {
        setBuyBusy(false);
        if (status === "paid") setLimitPrompt(null);
      });
    } catch {
      setBuyBusy(false);
    }
  }

  return (
    <GlassPanel className="reveal">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="screen-title">Плейлисты</h1>
        {!creating && (
          <button type="button" className="glass-button icon-only" aria-label="Создать плейлист" onClick={() => setCreating(true)}>
            <Plus size={18} weight="bold" />
          </button>
        )}
      </div>

      {limitPrompt && (
        <div className="add-to-playlist-limit mt-12">
          <p className="text-muted fs-label">
            Лимит плейлистов исчерпан. Докупите слот за <strong>{limitPrompt.starsPrice}⭐</strong>.
          </p>
          <button type="button" className="glass-button primary" disabled={buyBusy} onClick={() => void buySlot()}>
            {buyBusy ? <CircleNotch size={16} className="spin" /> : <Sparkle size={16} weight="fill" />} Купить слот
          </button>
          <button type="button" className="glass-button" onClick={() => setLimitPrompt(null)}>Отмена</button>
        </div>
      )}

      {creating && (
        <div className="add-to-playlist-create-row mt-12">
          <input
            className="add-to-playlist-input"
            placeholder="Название плейлиста"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
          />
          <button type="button" className="icon-btn" aria-label="Создать" disabled={createBusy || newName.trim().length === 0} onClick={() => void handleCreate()}>
            {createBusy ? <CircleNotch size={18} className="spin" /> : <Check size={18} weight="bold" />}
          </button>
        </div>
      )}

      {playlists === null && (
        <p className="text-muted search-status mt-12">
          <CircleNotch size={16} className="spin" /> Загружаю…
        </p>
      )}

      {playlists !== null && playlists.length === 0 && !creating && (
        <EmptyState icon={<PlaylistIcon size={22} weight="bold" />} label="Пока нет плейлистов" />
      )}

      {playlists !== null && playlists.length > 0 && (
        <div className="stack reveal-stagger mt-12">
          {playlists.map((p, i) => (
            <button key={p.id} type="button" className="track-row search-artist-row" style={{ ["--i" as string]: i }} onClick={() => onOpen(p.id)}>
              <PlaylistCover playlistId={p.id} />
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <p className="search-row-title">{p.name}</p>
                <p className="text-muted search-row-meta">{p.trackCount} тр.</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

/** Playlist detail: Back to Музыка (8.1), rename/delete, track list with remove + play. */
function PlaylistDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const player = usePlayer();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trackDownloads, setTrackDownloads] = useState<Record<string, "sending" | "sent">>({});
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    api.playlist(id).then((r) => setPlaylist(r.playlist)).catch(() => setPlaylist(null));
  }, [id]);

  const queue = useMemo(
    () => (playlist?.tracks ?? []).map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork ?? undefined })),
    [playlist],
  );

  async function handleRename() {
    const name = nameDraft.trim();
    if (!playlist || !name || name === playlist.name) {
      setRenaming(false);
      return;
    }
    await api.renamePlaylist(id, name).catch(() => {});
    setPlaylist((p) => (p ? { ...p, name } : p));
    setRenaming(false);
  }

  async function handleDelete() {
    await api.deletePlaylist(id).catch(() => {});
    onBack();
  }

  async function handleRemoveTrack(uri: string) {
    setRemoving((m) => ({ ...m, [uri]: true }));
    try {
      await api.removeTrackFromPlaylist(id, uri);
      setPlaylist((p) => (p ? { ...p, tracks: p.tracks.filter((t) => t.uri !== uri) } : p));
    } finally {
      setRemoving((m) => ({ ...m, [uri]: false }));
    }
  }

  async function handleDownloadAll() {
    if (!playlist || playlist.tracks.length === 0 || downloadingAll) return;
    setDownloadingAll(true);
    try {
      await api.download(
        playlist.name,
        playlist.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork ?? undefined })),
      );
      window.dispatchEvent(new CustomEvent("download-created"));
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleTrackDownload(track: PlaylistDetail["tracks"][number]) {
    if (trackDownloads[track.uri] === "sending") return;
    setTrackDownloads((m) => ({ ...m, [track.uri]: "sending" }));
    try {
      await api.download(`${track.title} — ${track.artist}`, [
        { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork ?? undefined },
      ]);
      setTrackDownloads((m) => ({ ...m, [track.uri]: "sent" }));
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch {
      setTrackDownloads((m) => {
        const next = { ...m };
        delete next[track.uri];
        return next;
      });
    }
  }

  return (
    <GlassPanel className="reveal">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="action-btn action-btn--neutral" aria-label="Назад к Музыке" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        {playlist && !confirmDelete && (
          <div className="row" style={{ gap: 6 }}>
            {playlist.tracks.length > 0 && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Скачать всё"
                title="Скачать всё"
                disabled={downloadingAll}
                onClick={() => void handleDownloadAll()}
              >
                {downloadingAll ? <CircleNotch size={18} className="spin" /> : <DownloadSimple size={18} />}
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Удалить плейлист" onClick={() => setConfirmDelete(true)}>
              <Trash size={18} />
            </button>
          </div>
        )}
        {confirmDelete && (
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="action-btn action-btn--destructive" aria-label="Подтвердить удаление" onClick={() => void handleDelete()}>
              <Check size={18} weight="bold" />
            </button>
            <button type="button" className="action-btn" aria-label="Отмена" onClick={() => setConfirmDelete(false)}>
              <X size={18} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {playlist === null && (
        <p className="text-muted search-status mt-12">
          <CircleNotch size={16} className="spin" /> Загружаю…
        </p>
      )}

      {playlist && (
        <>
          {renaming ? (
            <input
              className="playlist-name-input mt-12"
              autoFocus
              value={nameDraft}
              maxLength={200}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void handleRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <h1
              className="playlist-name-title mt-12"
              role="button"
              tabIndex={0}
              aria-label="Переименовать плейлист"
              onClick={() => { setNameDraft(playlist.name); setRenaming(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setNameDraft(playlist.name);
                  setRenaming(true);
                }
              }}
            >
              {playlist.name}
              <PencilSimple size={16} weight="bold" className="playlist-name-edit-icon" />
            </h1>
          )}

          {playlist.tracks.length === 0 ? (
            <EmptyState icon={<PlaylistIcon size={22} weight="bold" />} label="В плейлисте пока нет треков" />
          ) : (
            <div className="stack reveal-stagger mt-12">
              {playlist.tracks.map((track, i) => (
                <TrackRow
                  key={track.uri}
                  style={{ ["--i" as string]: i }}
                  onClick={() =>
                    player.toggle(
                      { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork ?? undefined },
                      queue,
                    )
                  }
                  artwork={track.artwork}
                  title={track.title}
                  meta={track.artist}
                  metaClassName="search-row-meta"
                  trailing={
                    <>
                      {removing[track.uri] && <CircleNotch size={16} className="spin" style={{ color: "var(--text-muted)" }} />}
                      <button
                        type="button"
                        className="icon-btn track-download-btn"
                        aria-label={trackDownloads[track.uri] === "sent" ? "Отправлено в чат" : "Скачать"}
                        title={trackDownloads[track.uri] === "sent" ? "Отправлено в чат" : "Скачать"}
                        disabled={trackDownloads[track.uri] === "sending"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTrackDownload(track);
                        }}
                      >
                        {trackDownloads[track.uri] === "sending" ? (
                          <CircleNotch size={18} className="spin" />
                        ) : trackDownloads[track.uri] === "sent" ? (
                          <Check size={18} weight="bold" />
                        ) : (
                          <DownloadSimple size={18} />
                        )}
                      </button>
                      <TrackOverflowMenu
                        actions={[
                          {
                            key: "remove",
                            label: "Убрать из плейлиста",
                            icon: <Trash size={18} />,
                            disabled: removing[track.uri],
                            destructive: true,
                            onClick: () => void handleRemoveTrack(track.uri),
                          },
                        ]}
                      />
                    </>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </GlassPanel>
  );
}

export default function PlaylistsScreen({ onOpenHistory }: { onOpenHistory: (entry: HistoryEntry) => void }) {
  const player = usePlayer();
  const [tracks, setTracks] = useState<SavedTrack[] | null>(null);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [openPlaylistId, setOpenPlaylistId] = useState<number | null>(null);
  const [trackDownloads, setTrackDownloads] = useState<Record<string, "sending" | "sent">>({});

  useEffect(() => {
    api.myMusic().then((r) => setTracks(r.tracks)).catch(() => setTracks([]));
  }, []);

  const queue = useMemo(
    () => (tracks ?? []).map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork ?? undefined })),
    [tracks],
  );

  async function handleRemove(uri: string) {
    setRemoving((prev) => ({ ...prev, [uri]: true }));
    try {
      await api.removeMyMusic(uri);
      setTracks((prev) => (prev ?? []).filter((t) => t.uri !== uri));
    } catch {
      setRemoving((prev) => ({ ...prev, [uri]: false }));
    }
  }

  async function handleTrackDownload(track: SavedTrack) {
    if (trackDownloads[track.uri] === "sending") return;
    setTrackDownloads((m) => ({ ...m, [track.uri]: "sending" }));
    try {
      await api.download(`${track.title} — ${track.artist}`, [
        { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork ?? undefined },
      ]);
      setTrackDownloads((m) => ({ ...m, [track.uri]: "sent" }));
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch {
      setTrackDownloads((m) => {
        const next = { ...m };
        delete next[track.uri];
        return next;
      });
    }
  }

  if (openPlaylistId !== null) {
    return <PlaylistDetailView id={openPlaylistId} onBack={() => setOpenPlaylistId(null)} />;
  }

  return (
    <div className="stack">
      <PlaylistsSection onOpen={setOpenPlaylistId} />

      <GlassPanel className="reveal">
        <h2 className="screen-title">Избранное</h2>

        {tracks === null && (
          <p className="text-muted search-status">
            <CircleNotch size={16} className="spin" /> Загружаю…
          </p>
        )}

        {tracks !== null && tracks.length === 0 && (
          <EmptyState icon={<MusicNotes size={22} weight="bold" />} label="Пока нет сохранённых треков" />
        )}

        {tracks !== null && tracks.length > 0 && (
          <div className="stack reveal-stagger">
            {tracks.map((track, i) => (
              <TrackRow
                key={track.uri}
                style={{ ["--i" as string]: i }}
                onClick={() =>
                  player.toggle(
                    { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork ?? undefined },
                    queue,
                  )
                }
                artwork={track.artwork}
                title={track.title}
                meta={track.artist}
                metaClassName="search-row-meta"
                trailing={
                  <>
                    {removing[track.uri] && <CircleNotch size={16} className="spin" style={{ color: "var(--text-muted)" }} />}
                    <button
                      type="button"
                      className="icon-btn track-download-btn"
                      aria-label={trackDownloads[track.uri] === "sent" ? "Отправлено в чат" : "Скачать"}
                      title={trackDownloads[track.uri] === "sent" ? "Отправлено в чат" : "Скачать"}
                      disabled={trackDownloads[track.uri] === "sending"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleTrackDownload(track);
                      }}
                    >
                      {trackDownloads[track.uri] === "sending" ? (
                        <CircleNotch size={18} className="spin" />
                      ) : trackDownloads[track.uri] === "sent" ? (
                        <Check size={18} weight="bold" />
                      ) : (
                        <DownloadSimple size={18} />
                      )}
                    </button>
                    <TrackOverflowMenu
                      actions={[
                        {
                          key: "add-to-playlist",
                          label: "Добавить в плейлист",
                          icon: <ListPlus size={18} weight="bold" />,
                          onClick: () =>
                            requestAddToPlaylist({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork ?? undefined }),
                        },
                        {
                          key: "remove",
                          label: "Убрать из избранного",
                          icon: <Trash size={18} />,
                          disabled: removing[track.uri],
                          destructive: true,
                          onClick: () => void handleRemove(track.uri),
                        },
                      ]}
                    />
                  </>
                }
              />
            ))}
          </div>
        )}
      </GlassPanel>

      <GlassPanel className="reveal">
        <h2 className="screen-title" style={{ marginBottom: 14 }}>Библиотека</h2>
        <LibrarySection onOpen={onOpenHistory} />
      </GlassPanel>
    </div>
  );
}
