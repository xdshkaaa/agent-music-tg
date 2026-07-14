import { useEffect, type RefObject } from "react";

/**
 * Toggles data-fade-left/data-fade-right on the scroll container based on
 * actual overflow, so CSS masks (see .scroll-fade in glass.css) only show on
 * the side(s) still clipped. Feature-guarded for WebViews without
 * ResizeObserver.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft < maxScroll - 1;
      el.toggleAttribute("data-fade-left", left);
      el.toggleAttribute("data-fade-right", right);
    }

    update();
    el.addEventListener("scroll", update, { passive: true });

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [ref]);
}
