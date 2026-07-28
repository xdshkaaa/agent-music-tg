import { useEffect } from "react";
import { getTelegramWebApp } from "./telegram";

/**
 * Overlap (px) below which a viewport change is a toolbar/URL-bar shuffle
 * rather than a keyboard. iOS moves the visual viewport by a few dozen px on
 * its own; treating that as "keyboard open" would flicker the chrome.
 */
export const KEYBOARD_THRESHOLD_PX = 80;

/**
 * How much of the layout viewport the keyboard covers. The layout viewport
 * (`innerHeight`) does not shrink for the keyboard on iOS — only the visual one
 * does — so the difference between them is the keyboard. Deliberately ignores
 * `offsetTop`: that shifts continuously while iOS pans the visual viewport, and
 * feeding it into a CSS variable would relayout the shell on every scroll tick.
 * Pure so the threshold behaviour is testable without a DOM.
 */
export function keyboardOverlap(
  innerHeight: number,
  viewport: { height: number } | null | undefined,
): number {
  if (!viewport) return 0;
  return Math.max(0, innerHeight - viewport.height);
}

/** Android clients resize the layout viewport too, so overlap stays 0 there — correctly. */
export function isKeyboardOpen(overlap: number): boolean {
  return overlap > KEYBOARD_THRESHOLD_PX;
}

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/**
 * Publishes the on-screen keyboard's height to CSS as `--keyboard-inset` and
 * `data-keyboard="open"` on the root element.
 *
 * The dock and the player bar are `position: fixed`, and the iOS Telegram
 * WebView re-anchors fixed elements to the *visual* viewport when the keyboard
 * opens — so they slide up and land on top of whatever the user is typing into.
 * Nothing in the layout can see that happen, so the CSS gets told about it here
 * and hides the chrome for the duration (see the `[data-keyboard="open"]` rules
 * in glass.css).
 *
 * Call once, at the app root.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const root = document.documentElement;
    let open = false;

    function apply() {
      const overlap = keyboardOverlap(window.innerHeight, window.visualViewport);
      root.style.setProperty("--keyboard-inset", `${overlap}px`);
      const next = isKeyboardOpen(overlap);
      if (next === open) return;
      open = next;
      if (!next) {
        root.removeAttribute("data-keyboard");
        return;
      }
      root.setAttribute("data-keyboard", "open");
      // Only on the closed -> open edge: the field the user just tapped may be
      // anywhere on the page, and with the chrome gone there is now room to put
      // it above the keyboard. A frame of delay lets the layout settle first.
      const active = document.activeElement;
      if (isTextField(active)) {
        requestAnimationFrame(() => active.scrollIntoView({ block: "center", behavior: "smooth" }));
      }
    }

    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);

    // Some Telegram clients resize the Mini App viewport without firing a
    // visualViewport event, so take their signal too — apply() is idempotent.
    const webApp = getTelegramWebApp();
    webApp?.onEvent("viewportChanged", apply);

    apply();

    return () => {
      vv?.removeEventListener("resize", apply);
      webApp?.offEvent?.("viewportChanged", apply);
      root.removeAttribute("data-keyboard");
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}
