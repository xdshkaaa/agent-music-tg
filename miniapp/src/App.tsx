import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Wallet, Sun, Moon } from "@phosphor-icons/react";
import { PromptScreen } from "./screens/PromptScreen";
import { ClarifyScreen } from "./screens/ClarifyScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import BuyScreen from "./screens/BuyScreen";
import ProfileScreen from "./screens/ProfileScreen";
import { GlassPanel } from "./components/GlassPanel";
import { ScreenTransition } from "./components/ScreenTransition";
import { ErrorBanner } from "./components/ErrorBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { api, type MeResponse, type FinalizedPlaylist, type ShopConfig } from "./lib/api";
import { getTelegramWebApp, getColorScheme } from "./lib/telegram";
import { PlayerProvider, usePlayer } from "./lib/player";
import { PlayerBar } from "./components/PlayerBar";
import { BottomNav } from "./components/BottomNav";
import { PlayerScreen } from "./screens/PlayerScreen";

// Lazy: the admin screen's own chunk is only fetched when isAdmin is true,
// so it never ships to a regular allowed user's browser. The real
// enforcement boundary is still server-side (see api/middleware.ts).
const AdminScreen = lazy(() => import("./screens/AdminScreen"));

type Screen =
  | { kind: "prompt" }
  | { kind: "clarify"; question: string; options: string[] }
  | { kind: "results"; playlist: FinalizedPlaylist }
  | { kind: "buy"; reason?: string }
  | { kind: "profile" }
  | { kind: "admin" };

function activeTab(screen: Screen): "create" | "shop" | "profile" | "admin" {
  switch (screen.kind) {
    case "prompt":
    case "clarify":
    case "results":
      return "create";
    case "buy":
      return "shop";
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
  buy: 1,
  profile: 2,
  admin: 3,
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
  const [busy, setBusy] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheme, setScheme] = useState<"light" | "dark">(() => initialScheme());
  const [lastGenerate, setLastGenerate] = useState<{ prompt: string } | null>(null);
  const [lastClarify, setLastClarify] = useState<{ answer: string } | null>(null);

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
    api.me().then(setMe).catch(() => {});
    api.shopConfig().then(setShopConfig).catch(() => {});
  }, []);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp?.BackButton) return;
    if (showPlayer || history.length > 1) {
      webApp.BackButton.show();
    } else {
      webApp.BackButton.hide();
    }
  }, [showPlayer, history.length]);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const bb = webApp?.BackButton;
    if (!bb) return;
    const handler = () => {
      if (showPlayer) {
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
  }, [showPlayer]);

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
    setReasoning(null);
    try {
      const outcome = await api.generateStream(prompt, setReasoning);
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setReasoning(null);
    }
  }

  async function handleClarifyAnswer(answer: string) {
    setLastClarify({ answer });
    setBusy(true);
    setError(null);
    setReasoning(null);
    try {
      const outcome = await api.generateResumeStream(answer, setReasoning);
      applyOutcome(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setReasoning(null);
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

  function applyOutcome(outcome: Awaited<ReturnType<typeof api.generate>>) {
    if (outcome.status === "clarify") {
      navigate({ kind: "clarify", question: outcome.question, options: outcome.options });
    } else if (outcome.status === "ok") {
      navigate({ kind: "results", playlist: outcome.playlist });
    } else if (outcome.status === "needs_purchase") {
      navigate({ kind: "buy", reason: "Генерации закончились — выберите пакет, чтобы продолжить." });
    } else {
      setError(outcome.message);
    }
  }

  function renderScreen(): ReactNode | null {
    switch (screen.kind) {
      case "prompt":
        return <PromptScreen onSubmit={handleSubmit} busy={busy} reasoning={reasoning} />;
      case "clarify":
        return (
          <ClarifyScreen
            question={screen.question}
            options={screen.options}
            onAnswer={handleClarifyAnswer}
            busy={busy}
            reasoning={reasoning}
          />
        );
      case "results":
        return (
          <ResultsScreen
            playlist={screen.playlist}
            onNewPrompt={() => navigate({ kind: "prompt" }, "back")}
          />
        );
      case "buy":
        return <BuyScreen reason={screen.reason} isAdmin={isAdmin} />;
      case "profile":
        return (
          <ProfileScreen
            me={me}
            onGoShop={() => navigate({ kind: "buy" })}
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

  function handleReset() {
    setHistory([{ kind: "prompt" }]);
    setError(null);
  }

  return (
    <ErrorBoundary onReset={handleReset}>
    <main className="app-shell">
      <header className="app-top-bar">
        <span className="app-top-brand">
          {shopConfig?.headerTitle || "agent music"}
        </span>
        <span className="app-top-actions">
          <button
            type="button"
            className="app-top-chip wallet-pill"
            aria-label="Открыть профиль"
            onClick={() => navigate({ kind: "profile" })}
          >
            <Wallet size={16} weight="bold" className="accent" />
            {me?.credits ?? 0} ген
          </button>
          <button
            type="button"
            className="theme-toggle"
            aria-label={scheme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            onClick={toggleScheme}
          >
            {scheme === "dark" ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
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
      <BottomNav tab={tab} isAdmin={isAdmin} onTab={(t) => { navigate({ kind: t === "shop" ? "buy" : t === "create" ? "prompt" : t === "profile" ? "profile" : "admin" }); }} />
    </main>
      {showPlayer && <PlayerScreen onClose={() => setShowPlayer(false)} />}
    </ErrorBoundary>
  );
}
