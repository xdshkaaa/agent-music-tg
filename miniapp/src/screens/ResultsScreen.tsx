import { GlassPanel } from "../components/GlassPanel";
import type { FinalizedPlaylist } from "../lib/api";

export function ResultsScreen({
  playlist,
  onPlay,
  onNewPrompt,
}: {
  playlist: FinalizedPlaylist;
  onPlay: (uri: string) => void;
  onNewPrompt: () => void;
}) {
  return (
    <GlassPanel>
      <h1>{playlist.name}</h1>
      {playlist.remotePlaylistUrl && (
        <p className="text-muted">
          <a href={playlist.remotePlaylistUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
            Open on Spotify ↗
          </a>
        </p>
      )}
      <div className="stack" style={{ marginTop: 16 }}>
        {playlist.tracks.map((track) => (
          <div className="track-row" key={track.uri}>
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
            {track.deepLink ? (
              <a href={track.deepLink} target="_blank" rel="noreferrer" className="glass-button">
                Open
              </a>
            ) : (
              <button className="glass-button" onClick={() => onPlay(track.uri)}>
                Play
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="glass-button" style={{ marginTop: 16 }} onClick={onNewPrompt}>
        New playlist
      </button>
    </GlassPanel>
  );
}
