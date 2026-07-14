import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Wallet } from "@phosphor-icons/react";
import { PromptScreen } from "./screens/PromptScreen";
import { ClarifyScreen } from "./screens/ClarifyScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import BuyScreen from "./screens/BuyScreen";
import ProfileScreen from "./screens/ProfileScreen";
import { GlassPanel } from "./components/GlassPanel";
import { ScreenTransition } from "./components/ScreenTransition";
import { ErrorBanner } from "./components/ErrorBanner";
import { IconOrEmoji } from "./components/IconOrEmoji";
import { api, type MeResponse, type FinalizedPlaylist, type ShopConfig } from "./lib/api";
import { getTelegramWebApp } from "./lib/telegram";
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

function AppInner() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [shopConfig, setShopConfig] = useState<ShopConfig | null>(null);
  const [history, setHistory] = useState<Screen[]>([{ kind: "prompt" }]);
  const screen = history[history.length - 1];
  const [transitionDir, setTransitionDir] = useState<"forward" | "back">("forward");
  const [showPlayer, setShowPlayer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = usePlayer();

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
        return <PromptScreen onSubmit={handleSubmit} busy={busy} />;
      case "clarify":
        return (
          <ClarifyScreen
            question={screen.question}
            options={screen.options}
            onAnswer={handleClarifyAnswer}
            busy={busy}
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
        return <BuyScreen reason={screen.reason} />;
      case "profile":
        return (
          <ProfileScreen
            me={me}
            shopConfig={shopConfig}
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

  return (
    <>
    <main className="app-shell">
      <header className="top-bar">
        <span className="logo-chip">
          {shopConfig?.headerIcon ? (
            <IconOrEmoji icon={shopConfig.headerIcon} size={22} />
          ) : (
            <span className="ring" aria-hidden="true" />
          )}
          {shopConfig?.headerTitle || "agent music"}
        </span>
        <span className="wallet-pill">
          <Wallet size={16} weight="bold" className="accent" />
          {me?.credits ?? 0} ген
        </span>
      </header>

      {error && (
        <ErrorBanner message={error} onClose={() => setError(null)} />
      )}

      <ScreenTransition kind={screen.kind} direction={transitionDir}>
        {renderScreen()}
      </ScreenTransition>

      <PlayerBar onOpen={() => setShowPlayer(true)} />
      <BottomNav tab={tab} isAdmin={isAdmin} onTab={(t) => { navigate({ kind: t === "shop" ? "buy" : t === "create" ? "prompt" : t === "profile" ? "profile" : "admin" }); }} />
    </main>
      {showPlayer && <PlayerScreen onClose={() => setShowPlayer(false)} />}
    </>
  );
}
