import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Overlays (bottom sheets, the full-screen player/artist/lyrics screens) mount
// as siblings of `.app-shell` in App.tsx, not children of it, so there is no
// prop path to hand it a ref. A depth counter lets nested overlays (artist
// opened from the player, lyrics opened from the player) layer correctly:
// the inner one unmounting must not lift `inert` while the outer is still open.
let inertDepth = 0;

function setBackgroundInert(inert: boolean) {
  const root = document.querySelector<HTMLElement>(".app-shell");
  if (!root) return;
  if (inert) {
    inertDepth += 1;
    root.setAttribute("inert", "");
  } else {
    inertDepth = Math.max(0, inertDepth - 1);
    if (inertDepth === 0) root.removeAttribute("inert");
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
 */
export function useDialog<T extends HTMLElement>(active: boolean, onClose: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  // Kept in a ref so the effect (which must not re-run except on active's
  // edges, to avoid re-trapping focus on every render) always calls the
  // latest onClose.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    setBackgroundInert(true);

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
      setBackgroundInert(false);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return ref;
}
