import { useState } from "react";
import { GlassPanel } from "../components/GlassPanel";

export function PromptScreen({
  onSubmit,
  needsSpotifyLink,
  onLinkSpotify,
  busy,
}: {
  onSubmit: (prompt: string) => void;
  needsSpotifyLink: boolean;
  onLinkSpotify: () => void;
  busy: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  return (
    <GlassPanel>
      <h1>What's the vibe?</h1>
      <p className="text-muted">Describe a mood, theme, or artist and get a real playlist.</p>
      <div className="stack" style={{ marginTop: 16 }}>
        {needsSpotifyLink && (
          <div className="stack">
            <p className="text-muted">Connect Spotify to generate and play a real playlist.</p>
            <button className="glass-button primary" onClick={onLinkSpotify}>
              Connect Spotify
            </button>
          </div>
        )}
        <textarea
          className="glass-input"
          rows={3}
          placeholder="late night driving synthwave"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          className="glass-button primary"
          disabled={busy || prompt.trim().length === 0}
          onClick={() => onSubmit(prompt.trim())}
        >
          {busy ? "Thinking…" : "Generate playlist"}
        </button>
      </div>
    </GlassPanel>
  );
}
