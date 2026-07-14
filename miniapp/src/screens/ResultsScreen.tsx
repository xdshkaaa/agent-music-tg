import { useState } from "react";
import { CheckCircle, CircleNotch, DownloadSimple, Plus, WarningCircle } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { TrackPlayButton } from "../components/PlayerBar";
import { usePlayer } from "../lib/player";
import { api, type FinalizedPlaylist } from "../lib/api";

type DownloadState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ResultsScreen({
  playlist,
  onNewPrompt,
}: {
  playlist: FinalizedPlaylist;
  onNewPrompt: () => void;
}) {
  const player = usePlayer();
  const [download, setDownload] = useState<DownloadState>({ kind: "idle" });

  async function handleDownload() {
    setDownload({ kind: "sending" });
    try {
      await api.download(playlist.name, playlist.tracks);
      setDownload({ kind: "sent" });
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
            onClick={() => {
              player.setQueue(
                playlist.tracks.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork }))
              );
              player.toggle({ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork });
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
            <TrackPlayButton
              track={{ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork }}
              stopPropagation
            />
          </div>
        ))}
      </div>
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
              color: "var(--accent)",
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
