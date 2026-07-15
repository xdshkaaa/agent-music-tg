import { useEffect, useRef } from "react";
import { toLines, countTools, type AgentEvent, type LineSegment } from "../lib/reasoning";

interface ReasoningTranscriptProps {
  /** Ordered agent events, folded via reduceEvents by the caller. */
  events: AgentEvent[];
  /** When true, render just a one-line summary instead of the full scrollback. */
  collapsed?: boolean;
  /** Max pixel height before the transcript scrolls internally. */
  maxHeight?: number;
  /** Regular users get Russian tool labels instead of raw camelCase/snake_case names. */
  friendly?: boolean;
}

const TONE_CLASS: Record<LineSegment["tone"], string> = {
  reasoning: "reasoning-tone-muted",
  call: "reasoning-tone-accent",
  args: "reasoning-tone-muted",
  ok: "reasoning-tone-ok",
  error: "reasoning-tone-error",
};

/** Marker glyphs map to a dot modifier class so CSS can style each kind distinctly. */
const MARKER_CLASS: Record<string, string> = {
  "⏺": "reasoning-dot-call",
  "⎿": "reasoning-dot-result",
  "·": "reasoning-dot-thought",
};

export function ReasoningTranscript({ events, collapsed, maxHeight = 160, friendly }: ReasoningTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const lines = collapsed ? [] : toLines(events, { friendly });

  // Stick-to-bottom: only auto-scroll if the user hasn't scrolled up to read
  // history. Re-engages automatically once they scroll back to the tail.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  if (collapsed) {
    const toolCount = countTools(events);
    if (toolCount === 0) return null;
    return (
      <p className="reasoning-collapsed">
        {toolCount} {toolCount === 1 ? "инструмент" : "инструментов"}
      </p>
    );
  }

  if (lines.length === 0) return null;

  return (
    <div ref={scrollRef} className="reasoning-transcript" style={{ maxHeight }} onScroll={handleScroll}>
      {lines.map((line) => (
        <div key={line.key} className="reasoning-line" style={{ paddingLeft: line.depth * 16 }}>
          <span className={`reasoning-dot ${MARKER_CLASS[line.marker] ?? ""}`} aria-hidden="true" />
          <span className="reasoning-text">
            {line.segments.map((seg, i) => (
              <span key={i} className={TONE_CLASS[seg.tone]}>
                {seg.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
