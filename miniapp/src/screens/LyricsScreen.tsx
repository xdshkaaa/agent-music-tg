import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleNotch, MusicNotesSimple, WarningCircle } from "@phosphor-icons/react";
import { api, type LyricsResult } from "../lib/api";

/** Index of the last line whose timestamp has passed; -1 before the first line. */
function activeLineIndex(lines: { t: number }[], currentTime: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.t <= currentTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function LyricsScreen({
  track,
  currentTime,
  duration,
  onSeek,
  onClose,
}: {
  track: { title: string; artist: string };
  currentTime: number;
  /** Seconds; used to convert a tapped line's timestamp into a seek fraction. */
  duration: number;
  onSeek: (fraction: number) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<LyricsResult | "loading" | "error">("loading");
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    setResult("loading");
    api
      .lyrics(track.artist, track.title, duration || undefined)
      .then(setResult)
      .catch(() => setResult("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.artist, track.title]);

  const lines = result !== "loading" && result !== "error" && result.status === "synced" ? result.lines : null;
  const activeIndex = useMemo(() => (lines ? activeLineIndex(lines, currentTime) : -1), [lines, currentTime]);

  useEffect(() => {
    if (activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div className="player-screen-overlay lyrics-screen-overlay">
      <div className="player-screen glass lyrics-screen">
        <div className="player-screen-header">
          <button type="button" className="action-btn action-btn--neutral" aria-label="Закрыть текст песни" onClick={onClose}>
            <ArrowLeft size={24} />
          </button>
        </div>

        <div className="lyrics-screen-body">
          {result === "loading" && (
            <p className="text-muted lyrics-screen-status">
              <CircleNotch size={18} className="spin" /> Ищу текст…
            </p>
          )}

          {(result === "error" || (result !== "loading" && result.status === "notFound")) && (
            <p className="text-muted lyrics-screen-status">
              <WarningCircle size={18} weight="bold" /> Я не нашел текст песни, простите ;(
            </p>
          )}

          {result !== "loading" && result !== "error" && result.status === "plain" && (
            <p className="lyrics-screen-plain">{result.text}</p>
          )}

          {lines && (
            <ul className="lyrics-screen-lines">
              {lines.map((l, i) => (
                <li
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`lyrics-screen-line${i === activeIndex ? " active" : ""}`}
                  onClick={() => onSeek(duration > 0 ? l.t / duration : 0)}
                >
                  {l.line || <MusicNotesSimple size={14} weight="bold" aria-hidden />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
