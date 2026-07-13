import { lazy, Suspense, useEffect, useState } from "react";
import { PromptScreen } from "./screens/PromptScreen";
import { ClarifyScreen } from "./screens/ClarifyScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { GlassPanel } from "./components/GlassPanel";
import { api, type FinalizedPlaylist } from "./lib/api";
import { getTelegramWebApp } from "./lib/telegram";

// Lazy: the settings screen's own chunk is only fetched when isAdmin is true,
// so it never even ships to a regular allowed user's browser. The real
// enforcement boundary is still server-side (see api/middleware.ts).
const SettingsScreen = lazy(() => import("./screens/SettingsScreen"));

type Screen =
  | { kind: "prompt" }
  | { kind: "clarify"; question: string; options: string[] }
  | { kind: "results"; playlist: FinalizedPlaylist }
  | { kind: "settings" };

export function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsSpotifyLink, setNeedsSpotifyLink] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "prompt" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();
    api.me().then((me) => setIsAdmin(me.isAdmin)).catch(() => {});
    api.spotifyStatus().then((s) => setNeedsSpotifyLink(!s.linked)).catch(() => {});
  }, []);

  async function handleSubmit(prompt: string) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.generate(prompt);
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleClarifyAnswer(answer: string) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.generateResume(answer);
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyOutcome(outcome: Awaited<ReturnType<typeof api.generate>>) {
    if (outcome.status === "clarify") {
      setScreen({ kind: "clarify", question: outcome.question, options: outcome.options });
    } else if (outcome.status === "ok") {
      setScreen({ kind: "results", playlist: outcome.playlist });
    } else {
      setError(outcome.message);
    }
  }

  async function handlePlay(uri: string) {
    try {
      await api.play(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app-shell">
      <div className="nav-row">
        <button className="glass-button" onClick={() => setScreen({ kind: "prompt" })}>
          Generate
        </button>
        {isAdmin && (
          <button className="glass-button" onClick={() => setScreen({ kind: "settings" })}>
            Settings
          </button>
        )}
      </div>

      {error && <GlassPanel className="stack">⚠️ {error}</GlassPanel>}

      {screen.kind === "prompt" && (
        <PromptScreen
          onSubmit={handleSubmit}
          needsSpotifyLink={needsSpotifyLink}
          onLinkSpotify={() => api.spotifyLink().then((r) => window.open(r.url, "_blank"))}
          busy={busy}
        />
      )}
      {screen.kind === "clarify" && (
        <ClarifyScreen question={screen.question} options={screen.options} onAnswer={handleClarifyAnswer} busy={busy} />
      )}
      {screen.kind === "results" && (
        <ResultsScreen playlist={screen.playlist} onPlay={handlePlay} onNewPrompt={() => setScreen({ kind: "prompt" })} />
      )}
      {screen.kind === "settings" && isAdmin && (
        <Suspense fallback={<GlassPanel>Loading…</GlassPanel>}>
          <SettingsScreen />
        </Suspense>
      )}
    </div>
  );
}
