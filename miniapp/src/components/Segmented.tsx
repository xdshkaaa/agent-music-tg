import { useLayoutEffect, useRef, useState } from "react";

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
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
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

  return (
    <div className="segmented glass" role="tablist" aria-label={ariaLabel} ref={trackRef}>
      <span
        className="segmented-indicator glass-indicator"
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
          role="tab"
          aria-selected={id === value}
          className={`segmented-option${id === value ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}
