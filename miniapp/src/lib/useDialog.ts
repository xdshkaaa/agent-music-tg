import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Overlays (bottom sheets, the full-screen player/artist/lyrics screens) mount
// as siblings of `.app-shell` in App.tsx, not children of it, so there is no
// prop path to hand it a ref. A depth counter (per inert target, not global —
// see below) lets nested overlays (artist opened from the player, lyrics
// opened from the player) layer correctly: the inner one unmounting must not
// lift `inert` while the outer is still open.
//
// `inertScope` picks *what* goes inert:
// - "shell" (default): the whole `.app-shell` — top bar, dock and player bar
//   all go dead. Right for anything that should read as fully modal.
// - "content": only `.screen-stack` (the screen content, not the chrome
//   around it) — used by the non-nested artist screen so the dock/top-bar/
//   player-bar stay reachable while it's open, per its own z-index comment.
// Keyed by resolved element (not a single counter) so a "content"-scoped and
// a "shell"-scoped overlay open at once don't stomp each other's depth.
const inertDepths = new Map<HTMLElement, number>();

function resolveInertTarget(scope: "shell" | "content"): HTMLElement | null {
  const selector = scope === "content" ? ".screen-stack" : ".app-shell";
  return document.querySelector<HTMLElement>(selector);
}

function setBackgroundInert(inert: boolean, scope: "shell" | "content") {
  const root = resolveInertTarget(scope);
  if (!root) return;
  const depth = inertDepths.get(root) ?? 0;
  if (inert) {
    inertDepths.set(root, depth + 1);
    root.setAttribute("inert", "");
  } else {
    const next = Math.max(0, depth - 1);
    inertDepths.set(root, next);
    if (next === 0) root.removeAttribute("inert");
  }
}

/**
 * Focus trap + Escape-to-close + background `inert` + focus restore for modal
 * overlays. Put the returned ref on the overlay's outermost container (the
 * element carrying `role="dialog"`).
 *
 * `active` covers both ways overlays exist in this app: components that
 * truly mount/unmount when shown (the player, artist and lyrics screens) can
 * pass `true` for their whole lifetime; components that stay mounted and
 * toggle their own visibility (`AddToPlaylistSheet`) pass their open state so
 * the trap re-arms on each open instead of only on the app's first render.
 *
 * While active: the trigger that had focus is remembered, the background is
 * made inert, and focus moves to the first focusable descendant (or the
 * container itself, as a fallback, so overlays with no focusable content are
 * still reachable and dismissible). Tab wraps within the container; Escape
 * and going inactive both restore focus to the trigger.
 *
 * `inertScope` (default "shell") controls how much of the background goes
 * inert — see the comment above `inertDepths`. Pass "content" for an overlay
 * that should leave the dock/top-bar/player-bar reachable.
 */
export function useDialog<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
  options?: { inertScope?: "shell" | "content" },
): RefObject<T> {
  const ref = useRef<T>(null);
  const inertScope = options?.inertScope ?? "shell";
  // Kept in a ref so the effect (which must not re-run except on active's
  // edges, to avoid re-trapping focus on every render) always calls the
  // latest onClose / inertScope.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const inertScopeRef = useRef(inertScope);
  inertScopeRef.current = inertScope;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const scope = inertScopeRef.current;

    setBackgroundInert(true, scope);

    if (container && !container.hasAttribute("tabindex")) {
      container.tabIndex = -1;
    }

    function focusable(): HTMLElement[] {
      return container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    }

    const first = focusable()[0];
    (first ?? container)?.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      setBackgroundInert(false, scope);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return ref;
}
