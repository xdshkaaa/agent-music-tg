import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Wallet, Sun, Moon, AtIcon } from "@phosphor-icons/react";
import { PromptScreen } from "./screens/PromptScreen";
import { ClarifyScreen } from "./screens/ClarifyScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import BuyScreen from "./screens/BuyScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PlaylistsScreen from "./screens/PlaylistsScreen";
import { GlassPanel } from "./components/GlassPanel";
import { ScreenTransition } from "./components/ScreenTransition";
import { ErrorBanner } from "./components/ErrorBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { api, type MeResponse, type FinalizedPlaylist, type ShopConfig, type HistoryEntry } from "./lib/api";
import { reduceEvents, type AgentEvent } from "./lib/reasoning";
import { getTelegramWebApp, getColorScheme } from "./lib/telegram";
import { PlayerProvider, usePlayer } from "./lib/player";
import { PlayerBar } from "./components/PlayerBar";
import { BottomNav } from "./components/BottomNav";
import { PlayerScreen } from "./screens/PlayerScreen";
import { ArtistScreen } from "./screens/ArtistScreen";
import { AddToPlaylistSheet } from "./components/AddToPlaylistSheet";
import { applyAccent, initialAccent } from "./lib/accent";

// Lazy: the admin screen's own chunk is only fetched when isAdmin is true,
// so it never ships to a regular allowed user's browser. The real
// enforcement boundary is still server-side (see api/middleware.ts).
const AdminScreen = lazy(() => import("./screens/AdminScreen"));

type Screen =
  | { kind: "prompt" }
  | { kind: "clarify"; question: string; options: string[] }
  | { kind: "results"; playlist: FinalizedPlaylist; generationId: number; saved?: boolean }
  | { kind: "buy"; reason?: string }
  | { kind: "playlists" }
  | { kind: "profile" }
  | { kind: "admin" };

function activeTab(screen: Screen): "create" | "shop" | "playlists" | "profile" | "admin" {
  switch (screen.kind) {
    case "prompt":
    case "clarify":
    case "results":
      return "create";
    case "buy":
      return "shop";
    case "playlists":
      return "playlists";
    case "profile":
      return "profile";
    case "admin":
      return "admin";
  }
}

const TAB_ORDER: Record<string, number> = {
  create: 0,
  prompt: 0,
  clarify: 0,
  results: 0,
  buy: 2,
  playlists: 3,
  profile: 4,
  admin: 5,
};

export function App() {
  return (
    <PlayerProvider>
      <AppInner />
    </PlayerProvider>
  );
}

const SCHEME_STORAGE_KEY = "miniapp-scheme";

function initialScheme(): "light" | "dark" {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(SCHEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  }
  return getColorScheme();
}

function AppInner() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [shopConfig, setShopConfig] = useState<ShopConfig | null>(null);
  const [history, setHistory] = useState<Screen[]>([{ kind: "prompt" }]);
  const screen = history[history.length - 1];
  const [transitionDir, setTransitionDir] = useState<"forward" | "back">("forward");
  const [showPlayer, setShowPlayer] = useState(false);
  const [artistTarget, setArtistTarget] = useState<{ id?: string; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheme, setScheme] = useState<"light" | "dark">(() => initialScheme());
  const [accent, setAccent] = useState<string>(() => initialAccent());

  function changeAccent(value: string) {
    setAccent(value);
    applyAccent(value);
  }
  const [lastGenerate, setLastGenerate] = useState<{ prompt: string } | null>(null);
  const [lastClarify, setLastClarify] = useState<{ answer: string } | null>(null);
  const [lastCreateScreen, setLastCreateScreen] = useState<Screen>({ kind: "prompt" });

  const player = usePlayer();

  function toggleScheme() {
    setScheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-scheme", next);
      try {
        localStorage.setItem(SCHEME_STORAGE_KEY, next);
      } catch {
        // ignore storage failures (private mode etc.)
      }
      return next;
    });
  }

  useEffect(() => {
    const webApp = getTelegramWebApp();
    webApp?.ready();
    webApp?.expand();
    applyAccent(accent);
    api.me().then(setMe).catch(() => {});
    api.shopConfig().then(setShopConfig).catch(() => {});

    // Bot inline buttons ("Поиск" / "Мои плейлисты" / "Моя музыка") deep-link
    // here with ?tab=... so they land on the right screen, not just the root.
    // mode=search (read by PromptScreen itself) additionally pre-selects the
    // search tab within "Создать".
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam === "playlists") navigate({ kind: "playlists" });
    else if (tabParam === "profile") navigate({ kind: "profile" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hot-swap the wallet chip: anything that changes the balance (generation,
  // extend, purchase, trial claim) dispatches "balance-changed".
  useEffect(() => {
    const onBalanceChanged = () => {
      api.me().then(setMe).catch(() => {});
    };
    window.addEventListener("balance-changed", onBalanceChanged);
    return () => window.removeEventListener("balance-changed", onBalanceChanged);
  }, []);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp?.BackButton) return;
    if (artistTarget || showPlayer || history.length > 1) {
      webApp.BackButton.show();
    } else {
      webApp.BackButton.hide();
    }
  }, [artistTarget, showPlayer, history.length]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const bb = webApp?.BackButton;
    if (!bb) return;
    const handler = () => {
      if (artistTarget) {
        setArtistTarget(null);
      } else if (showPlayer) {
        setShowPlayer(false);
      } else {
        setHistory(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
        setTransitionDir("back");
      }
    };
    bb.onClick(handler);
    return () => {
      bb.offClick(handler);
    };
  }, [artistTarget, showPlayer]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    if (player.track && player.status !== "idle") {
      webApp.enableClosingConfirmation?.();
    } else {
      webApp.disableClosingConfirmation?.();
    }
  }, [player.track, player.status]);

  async function handleSubmit(prompt: string) {
    setLastGenerate({ prompt });
    setLastClarify(null);
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const outcome = await api.generateStream(prompt, (e) => setEvents((prev) => reduceEvents(prev, e)));
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleClarifyAnswer(answer: string) {
    setLastClarify({ answer });
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const outcome = await api.generateResumeStream(answer, (e) => setEvents((prev) => reduceEvents(prev, e)));
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function retryLast() {
    if (lastClarify) void handleClarifyAnswer(lastClarify.answer);
    else if (lastGenerate) void handleSubmit(lastGenerate.prompt);
  }

  function navigate(target: Screen, dir?: "forward" | "back") {
    if (dir === "back") {
      setTransitionDir("back");
      setHistory([target]);
      return;
    }
    const newTab = activeTab(target);
    if (newTab !== tab) {
      setTransitionDir(TAB_ORDER[newTab] >= TAB_ORDER[tab] ? "forward" : "back");
      setHistory([target]);
    } else {
      setTransitionDir("forward");
      setHistory(prev => {
        const next = [...prev, target];
        return next.length > 10 ? next.slice(next.length - 10) : next;
      });
    }
  }

  function formatRetryTime(retryAt: number): string {
    const t = new Date(retryAt * 1000);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function applyOutcome(outcome: Awaited<ReturnType<typeof api.generate>>) {
    if (outcome.status === "clarify") {
      navigate({ kind: "clarify", question: outcome.question, options: outcome.options });
    } else if (outcome.status === "ok") {
      window.dispatchEvent(new CustomEvent("balance-changed"));
      navigate({ kind: "results", playlist: outcome.playlist, generationId: outcome.generationId });
    } else if (outcome.status === "needs_purchase") {
      navigate({ kind: "buy", reason: "Генерации закончились. Выберите пакет, чтобы продолжить." });
    } else if (outcome.status === "rate_limited") {
      setError(`Лимит генераций по подписке исчерпан. Снова доступно в ${formatRetryTime(outcome.retryAt)}.`);
    } else {
      setError(outcome.message);
    }
  }

  function renderScreen(): ReactNode | null {
    switch (screen.kind) {
      case "prompt":
        return (
          <PromptScreen
            onSubmit={handleSubmit}
            busy={busy}
            events={events}
            isAdmin={isAdmin}
            onOpenArtist={(target) => setArtistTarget(target)}
          />
        );
      case "clarify":
        return (
          <ClarifyScreen
            question={screen.question}
            options={screen.options}
            onAnswer={handleClarifyAnswer}
            busy={busy}
            events={events}
            isAdmin={isAdmin}
          />
        );
      case "results":
        return (
          <ResultsScreen
            playlist={screen.playlist}
            generationId={screen.generationId}
            initialSaved={screen.saved}
            onNewPrompt={() => navigate({ kind: "prompt" }, "back")}
          />
        );
      case "buy":
        return <BuyScreen reason={screen.reason} isAdmin={isAdmin} />;
      case "playlists":
        return (
          <PlaylistsScreen
            onOpenHistory={(entry: HistoryEntry) =>
              navigate({
                kind: "results",
                generationId: entry.id,
                saved: true,
                playlist: { name: entry.playlistName ?? entry.prompt, tracks: entry.tracks },
              })
            }
          />
        );
      case "profile":
        return (
          <ProfileScreen
            me={me}
            onGoShop={() => navigate({ kind: "buy" })}
            accent={accent}
            onChangeAccent={changeAccent}
          />
        );
      case "admin":
        return isAdmin ? (
          <Suspense fallback={<GlassPanel>Загрузка…</GlassPanel>}>
            <AdminScreen />
          </Suspense>
        ) : null;
    }
  }

  const tab = activeTab(screen);
  const isAdmin = me?.isAdmin ?? false;

  // Remember the last screen shown on the "create" tab (prompt/clarify/results)
  // so switching to another tab and back restores it instead of resetting.
  useEffect(() => {
    if (tab === "create") setLastCreateScreen(screen);
  }, [tab, screen]);

  function handleReset() {
    setHistory([{ kind: "prompt" }]);
    setError(null);
  }

  return (
    <ErrorBoundary onReset={handleReset}>
    <main className="app-shell">
      <header className="app-top-bar">
        <span className="app-top-brand" title="music agent">
          <span className="app-top-logo" aria-hidden>
            <AtIcon size={12} weight="fill" />
          </span>
          {shopConfig?.headerTitle || "agent music"}
        </span>
        <span className="app-top-actions">
          {tab !== "profile" && (
            <button
              type="button"
              className="wallet-badge"
              aria-label={`Генераций осталось: ${me?.credits ?? 0}`}
              title="Генерации"
              onClick={() => navigate({ kind: "profile" })}
            >
              <Wallet size={14} weight="bold" />
              <span className="wallet-count">{me?.credits ?? 0}</span>
              {me?.trial?.active && me.trial.creditsLeft > 0 ? (
                <span className="wallet-trial">+{me.trial.creditsLeft}</span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            className="theme-toggle"
            aria-label={scheme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            onClick={toggleScheme}
          >
            {scheme === "dark" ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}
          </button>
        </span>
      </header>

      {error && (
        <ErrorBanner message={error} onClose={() => setError(null)} onRetry={retryLast} isAdmin={isAdmin} />
      )}

      <ScreenTransition kind={screen.kind} direction={transitionDir}>
        {renderScreen()}
      </ScreenTransition>

      <PlayerBar onOpen={() => setShowPlayer(true)} />
      <BottomNav
        tab={tab}
        isAdmin={isAdmin}
        onTab={(t) => {
          navigate(
            t === "shop"
              ? { kind: "buy" }
              : t === "create"
                ? lastCreateScreen
                : t === "playlists"
                  ? { kind: "playlists" }
                  : t === "profile"
                    ? { kind: "profile" }
                    : { kind: "admin" },
          );
        }}
      />
    </main>
      {showPlayer && (
        <PlayerScreen onClose={() => setShowPlayer(false)} onOpenArtist={(name) => setArtistTarget({ name })} />
      )}
      {artistTarget && (
        <ArtistScreen target={artistTarget} onClose={() => setArtistTarget(null)} nested={showPlayer} />
      )}
      <AddToPlaylistSheet />
    </ErrorBoundary>
  );
}
