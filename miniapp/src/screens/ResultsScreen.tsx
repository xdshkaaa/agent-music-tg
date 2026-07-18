import { useEffect, useRef, useState } from "react";
import { BookmarkSimple, CheckCircle, CircleNotch, DownloadSimple, ListPlus, PencilSimple, Plus, WarningCircle } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { TrackOverflowMenu } from "../components/TrackOverflowMenu";
import { requestAddToPlaylist } from "../components/AddToPlaylistButton";
import { usePlayer } from "../lib/player";
import { api, type FinalizedPlaylist, type Track, type TrackVerificationStatus } from "../lib/api";

type DownloadState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ResultsScreen({
  playlist,
  generationId,
  initialSaved = false,
  onNewPrompt,
}: {
  playlist: FinalizedPlaylist;
  generationId: number;
  initialSaved?: boolean;
  onNewPrompt: () => void;
}) {
  const player = usePlayer();
  const [current, setCurrent] = useState<FinalizedPlaylist>(playlist);
  const [download, setDownload] = useState<DownloadState>({ kind: "idle" });
  const [trackDownloads, setTrackDownloads] = useState<Record<string, DownloadState>>({});
  // URIs already sent to the chat: after an extend, «Скачать» delivers only
  // the newly added tracks instead of re-sending the whole playlist.
  const downloadedUris = useRef<Set<string>>(new Set());
  const [saved, setSaved] = useState(initialSaved);
  const [saveBusy, setSaveBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(playlist.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [verification, setVerification] = useState<Record<string, TrackVerificationStatus>>({});
  const [savedTracks, setSavedTracks] = useState<Record<string, boolean>>({});
  const polling = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    api.myMusic().then(({ tracks }) => setSavedTracks(Object.fromEntries(tracks.map((t) => [t.uri, true])))).catch(() => {});
  }, []);

  const uris = current.tracks.map((t) => t.uri);
  const visibleTracks = current.tracks.filter((t) => verification[t.uri] !== "unavailable");

  useEffect(() => {
    polling.current = true;
    done.current = false;
    let stopped = false;
    const MAX_POLLS = 45; // ~90s cap so a stuck "pending" track doesn't poll forever
    let attempts = 0;

    async function poll() {
      while (polling.current && !stopped && attempts < MAX_POLLS) {
        if (document.hidden) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        attempts += 1;
        try {
          const result = await api.verifyTracks(uris);
          if (stopped) return;
          setVerification(result);
          const allDone = uris.every((u) => {
            const s = result[u];
            return s === "verified" || s === "unavailable";
          });
          if (allDone) {
            polling.current = false;
            done.current = true;
            return;
          }
        } catch {
          // retry on next tick
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    poll();
    return () => { stopped = true; };
  }, [uris.join(",")]);

  function handleTrackClick(track: typeof current.tracks[0]) {
    player.toggle(
      { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
      current.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
    );
  }

  function verificationIcon(uri: string) {
    const s = verification[uri];
    if (!s || s === "pending") return null;
    if (s === "checking") return <CircleNotch size={14} className="spin" style={{ color: "var(--text-muted)" }} />;
    if (s === "verified") return <CheckCircle size={14} weight="fill" style={{ color: "var(--accent)" }} />;
    return <WarningCircle size={14} weight="fill" style={{ color: "var(--danger)" }} />;
  }

  async function handleDownload() {
    const fresh = current.tracks.filter((t) => !downloadedUris.current.has(t.uri));
    // Nothing new since the last send (no extend happened) — re-send everything.
    const toSend = fresh.length > 0 ? fresh : current.tracks;
    const name = fresh.length > 0 && fresh.length < current.tracks.length
      ? `${current.name} (добавленное)`
      : current.name;
    setDownload({ kind: "sending" });
    try {
      await api.download(name, toSend);
      for (const t of toSend) downloadedUris.current.add(t.uri);
      setDownload({ kind: "sent" });
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch (e) {
      setDownload({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Merged action (screen-refinement D7): downloads the track to chat AND saves it to Favorites in one tap. */
  async function handleTrackDownload(track: Track) {
    if (trackDownloads[track.uri]?.kind === "sending") return;
    setTrackDownloads((m) => ({ ...m, [track.uri]: { kind: "sending" } }));
    try {
      await Promise.all([
        api.download(`${track.title} — ${track.artist}`, [track]),
        savedTracks[track.uri]
          ? Promise.resolve()
          : api.addMyMusic({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork }),
      ]);
      downloadedUris.current.add(track.uri);
      setSavedTracks((m) => ({ ...m, [track.uri]: true }));
      setTrackDownloads((m) => ({ ...m, [track.uri]: { kind: "sent" } }));
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch (err) {
      setTrackDownloads((m) => ({
        ...m,
        [track.uri]: { kind: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function handleRename() {
    const name = nameDraft.trim();
    if (name.length === 0 || name === current.name) {
      setNameDraft(current.name);
      setEditingName(false);
      return;
    }
    setRenameBusy(true);
    try {
      await api.renameGeneration(generationId, name);
      setCurrent((c) => ({ ...c, name }));
      setEditingName(false);
    } catch {
      setNameDraft(current.name);
    } finally {
      setRenameBusy(false);
    }
  }

  async function handleToggleSave() {
    if (saveBusy) return;
    setSaveBusy(true);
    try {
      if (saved) {
        await api.unsaveGeneration(generationId);
        setSaved(false);
      } else {
        await api.saveGeneration(generationId);
        setSaved(true);
      }
    } catch {
      // leave state unchanged on failure
    } finally {
      setSaveBusy(false);
    }
  }

  // --- Extend (add_to_playlist) -----------------------------------------
  const [extendPrompt, setExtendPrompt] = useState("");
  const [extendBusy, setExtendBusy] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  async function handleExtend() {
    const prompt = extendPrompt.trim();
    if (prompt.length === 0 || extendBusy) return;
    setExtendBusy(true);
    setExtendError(null);
    try {
      const outcome = await api.extendStream(generationId, prompt, () => {});
      if (outcome.status === "ok") {
        setCurrent(outcome.playlist);
        setExtendPrompt("");
        // New tracks arrived — make «Скачать» actionable again for the delta.
        setDownload({ kind: "idle" });
        window.dispatchEvent(new CustomEvent("balance-changed"));
      } else if (outcome.status === "error") {
        setExtendError(outcome.message);
      } else if (outcome.status === "needs_purchase") {
        setExtendError("Генерации закончились. Пополните баланс, чтобы добавить треки.");
      } else if (outcome.status === "rate_limited") {
        const t = new Date(outcome.retryAt * 1000);
        const hh = String(t.getHours()).padStart(2, "0");
        const mm = String(t.getMinutes()).padStart(2, "0");
        setExtendError(`Лимит генераций по подписке исчерпан. Снова доступно в ${hh}:${mm}.`);
      } else {
        setExtendError("Не удалось добавить треки. Попробуйте ещё раз.");
      }
    } catch (e) {
      setExtendError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtendBusy(false);
    }
  }

  return (
    <GlassPanel className="reveal">
      {editingName ? (
        <input
          className="playlist-name-input"
          autoFocus
          value={nameDraft}
          disabled={renameBusy}
          maxLength={200}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => void handleRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleRename();
            } else if (e.key === "Escape") {
              setNameDraft(current.name);
              setEditingName(false);
            }
          }}
        />
      ) : (
        <h1
          className="playlist-name-title"
          role="button"
          tabIndex={0}
          aria-label="Переименовать плейлист"
          onClick={() => { setNameDraft(current.name); setEditingName(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setNameDraft(current.name);
              setEditingName(true);
            }
          }}
        >
          {current.name}
          <PencilSimple size={16} weight="bold" className="playlist-name-edit-icon" />
        </h1>
      )}
      {done.current && visibleTracks.length === 0 ? (
        <p className="text-muted mt-16">Все треки недоступны</p>
      ) : (
        <div className="stack mt-16 reveal-stagger">
          {visibleTracks.map((track, i) => (
          <div
            className="track-row"
            key={track.uri}
            style={{ ["--i" as string]: i }}
            role="button"
            tabIndex={0}
            onClick={() => handleTrackClick(track)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleTrackClick(track);
              }
            }}
          >
            {track.artwork ? (
              <img className="track-artwork" src={track.artwork} alt="" />
            ) : (
              <div className="track-artwork" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="search-row-title">
                {track.title}
              </p>
              <p className="text-muted fs-label">
                {track.artist}
              </p>
            </div>
            {verificationIcon(track.uri)}
            <button
              type="button"
              className="icon-btn track-download-btn"
              aria-label={
                trackDownloads[track.uri]?.kind === "sent" || savedTracks[track.uri]
                  ? "Отправлено в чат и в избранном"
                  : "Скачать и добавить в избранное"
              }
              title={
                trackDownloads[track.uri]?.kind === "sent" || savedTracks[track.uri]
                  ? "Отправлено в чат и в избранном"
                  : "Скачать и добавить в избранное"
              }
              disabled={trackDownloads[track.uri]?.kind === "sending"}
              onClick={(e) => {
                e.stopPropagation();
                void handleTrackDownload(track);
              }}
            >
              {trackDownloads[track.uri]?.kind === "sending" ? (
                <CircleNotch size={18} className="spin" />
              ) : trackDownloads[track.uri]?.kind === "sent" || savedTracks[track.uri] ? (
                <CheckCircle size={18} weight="fill" />
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
                    requestAddToPlaylist({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork }),
                },
              ]}
            />
          </div>
        ))}
        </div>
      )}
      {download.kind === "error" && (
        <div className="error-row mt-12">
          <span className="error-row-icon">
            <WarningCircle size={16} weight="bold" />
          </span>
          <p role="alert" className="error-row-message">
            {download.message}
          </p>
          <button className="glass-button" onClick={() => setDownload({ kind: "idle" })} style={{ padding: "6px 12px" }}>
            Повторить
          </button>
        </div>
      )}
      {extendError && (
        <div className="error-row mt-12">
          <span className="error-row-icon">
            <WarningCircle size={16} weight="bold" />
          </span>
          <p role="alert" className="error-row-message">
            {extendError}
          </p>
        </div>
      )}
      <div className="prompt-pill mt-12">
          <textarea
            className="prompt-pill-input"
            rows={1}
            value={extendPrompt}
            onChange={(e) => setExtendPrompt(e.target.value)}
            placeholder="Что добавить в плейлист?"
            disabled={extendBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleExtend();
              }
            }}
          />
          <button
            type="button"
            className="prompt-submit"
            aria-label="Добавить треки в плейлист"
            disabled={extendBusy || extendPrompt.trim().length === 0}
            onClick={() => void handleExtend()}
          >
            {extendBusy ? <CircleNotch size={20} weight="bold" className="spin" /> : <Plus size={20} weight="bold" />}
          </button>
        </div>
      <div className="row mt-16 wrap">
        <button className="glass-button" onClick={onNewPrompt}>
          <Plus size={18} />
          Новый плейлист
        </button>
        <button
          className="glass-button icon-only"
          onClick={() => void handleToggleSave()}
          disabled={saveBusy}
          aria-label={saved ? "Убрать из истории" : "Сохранить в историю"}
          title={saved ? "Убрать из истории" : "Сохранить в историю"}
        >
          {saveBusy ? <CircleNotch size={18} className="spin" /> : <BookmarkSimple size={18} weight={saved ? "fill" : "regular"} />}
        </button>
        <button
          className="glass-button primary icon-only"
          onClick={handleDownload}
          disabled={download.kind === "sending"}
          aria-label={
            download.kind === "sending"
              ? "Отправляю в чат…"
              : download.kind === "sent"
                ? "Отправлено в чат"
                : "Скачать"
          }
          title={
            download.kind === "sending"
              ? "Отправляю в чат…"
              : download.kind === "sent"
                ? "Отправлено в чат"
                : "Скачать"
          }
        >
          {download.kind === "sending" ? (
            <CircleNotch size={18} className="spin" />
          ) : download.kind === "sent" ? (
            <CheckCircle size={18} weight="fill" />
          ) : (
            <DownloadSimple size={18} />
          )}
        </button>
      </div>
    </GlassPanel>
  );
}
