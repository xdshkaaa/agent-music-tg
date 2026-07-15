import { useCallback, useEffect, useRef } from "react";
import { Sparkle, Storefront, User, Shield } from "@phosphor-icons/react";

type Tab = "create" | "shop" | "profile" | "admin";

const TABS: { key: Tab; icon: typeof Sparkle; label: string }[] = [
  { key: "create", icon: Sparkle, label: "Создать" },
  { key: "shop", icon: Storefront, label: "Магазин" },
  { key: "profile", icon: User, label: "Профиль" },
];

export function BottomNav({
  tab,
  isAdmin,
  onTab,
}: {
  tab: Tab;
  isAdmin: boolean;
  onTab: (tab: Tab) => void;
}) {
  const tabs = isAdmin
    ? [...TABS, { key: "admin" as const, icon: Shield, label: "Админ" }]
    : TABS;

  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  tabRefs.current.length = tabs.length;

  const updateIndicator = useCallback(() => {
    const idx = tabs.findIndex((t) => t.key === tab);
    const btn = tabRefs.current[idx];
    const indicator = indicatorRef.current;
    if (!btn || !indicator) return;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
  }, [tab, tabs]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const ro = new ResizeObserver(() => updateIndicator());
    const parent = tabRefs.current[0]?.parentElement;
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [updateIndicator]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    document.fonts.ready.then(updateIndicator);
  }, [updateIndicator]);

  return (
    <nav className="dock" aria-label="Главное меню">
      <div className="dock-inner">
        <div className="dock-indicator" ref={indicatorRef} />
        {tabs.map((t, i) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              ref={(el) => { tabRefs.current[i] = el; }}
              className={`dock-tab${tab === t.key ? " active" : ""}`}
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => onTab(t.key)}
            >
              <Icon size={18} weight={tab === t.key ? "fill" : "bold"} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
