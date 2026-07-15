import { useEffect, useRef, useState } from "react";
import { CheckCircle, CircleNotch, DownloadSimple, Plus, WarningCircle } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { TrackPlayButton } from "../components/PlayerBar";
import { usePlayer } from "../lib/player";
import { api, type FinalizedPlaylist, type TrackVerificationStatus } from "../lib/api";

type DownloadState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };
type ToastState = { message: string } | null;

export function ResultsScreen({
  playlist,
  onNewPrompt,
}: {
  playlist: FinalizedPlaylist;
  onNewPrompt: () => void;
}) {
  const player = usePlayer();
  const [download, setDownload] = useState<DownloadState>({ kind: "idle" });
  const [verification, setVerification] = useState<Record<string, TrackVerificationStatus>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const polling = useRef(false);
  const done = useRef(false);

  const uris = playlist.tracks.map((t) => t.uri);

  useEffect(() => {
    polling.current = true;
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

  function handleTrackClick(track: typeof playlist.tracks[0]) {
    const status = verification[track.uri];
    if (status === "unavailable") {
      setToast({ message: "Трек недоступен" });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    player.toggle(
      { uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork },
      playlist.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork })),
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
    setDownload({ kind: "sending" });
    try {
      await api.download(playlist.name, playlist.tracks);
      setDownload({ kind: "sent" });
      window.dispatchEvent(new CustomEvent("download-created"));
    } catch (e) {
      setDownload({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <GlassPanel className="reveal">
      <h1>{playlist.name}</h1>
      <div className="stack mt-16 reveal-stagger">
        {playlist.tracks.map((track, i) => (
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
              <p style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {track.title}
              </p>
              <p className="text-muted" style={{ fontSize: 13 }}>
                {track.artist}
              </p>
            </div>
            {verificationIcon(track.uri)}
            <TrackPlayButton
              track={{ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork }}
              queue={playlist.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork }))}
              stopPropagation
              onBeforePlay={() => {
                if (verification[track.uri] === "unavailable") {
                  setToast({ message: "Трек недоступен" });
                  setTimeout(() => setToast(null), 3000);
                  return false;
                }
              }}
            />
          </div>
        ))}
      </div>
      {toast && (
        <div className="mt-12" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p role="alert" style={{ flex: 1, minWidth: 0 }}>
            <WarningCircle size={16} weight="bold" /> {toast.message}
          </p>
        </div>
      )}
      {download.kind === "error" && (
        <div className="mt-12" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p role="alert" style={{ flex: 1, minWidth: 0 }}>
            <WarningCircle size={16} weight="bold" /> {download.message}
          </p>
          <button className="glass-button" onClick={() => setDownload({ kind: "idle" })} style={{ padding: "6px 12px", fontSize: 13 }}>
            Повторить
          </button>
        </div>
      )}
      <div className="row mt-16 wrap">
        <button className="glass-button" onClick={onNewPrompt}>
          <Plus size={18} />
          Новый плейлист
        </button>
        {download.kind === "sent" ? (
          <p
            role="status"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              borderRadius: "var(--radius-card, 16px)",
              border: "1px solid var(--hairline)",
              fontWeight: 700,
              color: "var(--text-dark)",
            }}
          >
            <CheckCircle size={18} weight="fill" />
            Отправлено в чат
          </p>
        ) : (
          <button
            className="glass-button primary"
            onClick={handleDownload}
            disabled={download.kind === "sending"}
          >
            {download.kind === "sending" ? (
              <>
                <CircleNotch size={18} className="spin" />
                Отправляю в чат…
              </>
            ) : (
              <>
                <DownloadSimple size={18} />
                Скачать
              </>
            )}
          </button>
        )}
      </div>
    </GlassPanel>
  );
}
