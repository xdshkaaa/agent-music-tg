import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useScrollFade } from "../lib/useScrollFade";

/**
 * Glass segmented control: one track, a sliding `.glass-indicator` under the
 * active option. The indicator is ref-measured (offsetLeft/offsetWidth of the
 * active button) rather than assuming equal-width options, because the ids we
 * render vary a lot in length (e.g. "ollama" vs "youtube-music"). The slide is
 * gated on prefers-reduced-motion in CSS.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tinted,
  labels,
  fill,
  role = "tablist",
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  tinted?: boolean;
  labels?: Partial<Record<T, string>>;
  /** Options split the track equally instead of sizing to content. */
  fill?: boolean;
  /** "radiogroup" for settings pickers without tab panels. */
  role?: "tablist" | "radiogroup";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const activeIndex = Math.max(0, options.indexOf(value));

  useLayoutEffect(() => {
    const btn = btnRefs.current[activeIndex];
    const track = trackRef.current;
    if (!btn || !track) return;
    setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeIndex, options]);

  useScrollFade(trackRef);

  /** APG "selection follows focus": moving focus with arrow keys also selects. */
  function selectByIndex(i: number) {
    const opt = options[i];
    if (opt === undefined) return;
    onChange(opt);
    btnRefs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const count = options.length;
    if (count === 0) return;
    const vertical = role === "radiogroup";
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        selectByIndex((activeIndex + 1) % count);
        break;
      case "ArrowLeft":
        e.preventDefault();
        selectByIndex((activeIndex - 1 + count) % count);
        break;
      case "ArrowDown":
        if (!vertical) break;
        e.preventDefault();
        selectByIndex((activeIndex + 1) % count);
        break;
      case "ArrowUp":
        if (!vertical) break;
        e.preventDefault();
        selectByIndex((activeIndex - 1 + count) % count);
        break;
      case "Home":
        e.preventDefault();
        selectByIndex(0);
        break;
      case "End":
        e.preventDefault();
        selectByIndex(count - 1);
        break;
    }
  }

  return (
    <div
      className={`segmented glass${fill ? " segmented--fill" : ""}`}
      role={role}
      aria-label={ariaLabel}
      ref={trackRef}
      onKeyDown={onKeyDown}
    >
      <span
        className={`segmented-indicator${tinted ? " segmented-indicator-tinted" : ""} glass-indicator`}
        aria-hidden="true"
        style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
      />
      {options.map((id, i) => (
        <button
          key={id}
          ref={(el) => {
            btnRefs.current[i] = el;
          }}
          type="button"
          role={role === "radiogroup" ? "radio" : "tab"}
          // Roving tabindex (APG composite widget pattern): only the active
          // option sits in the page's tab order; arrow keys move within it.
          tabIndex={id === value ? 0 : -1}
          {...(role === "radiogroup"
            ? { "aria-checked": id === value }
            : { "aria-selected": id === value })}
          className={`segmented-option${id === value ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          {labels?.[id] ?? id}
        </button>
      ))}
    </div>
  );
}
