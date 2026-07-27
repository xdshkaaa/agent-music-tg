import { ArrowsClockwise } from "@phosphor-icons/react";
import { ReasoningTranscript } from "../components/ReasoningTranscript";
import type { HistoryEntry, SuggestionsResponse } from "../lib/api";
import type { AgentEvent } from "../lib/reasoning";
import { buildPromptFeed } from "../lib/suggestions";

/**
 * Up to four distinct covers from the playlist, as a small mosaic. Falls back
 * to fewer tiles when the playlist has fewer artworks, so a one-cover playlist
 * still renders a clean single tile rather than a gap-toothed grid.
 */
function coversOf(entry: HistoryEntry, max = 4): string[] {
  const seen = new Set<string>();
  for (const track of entry.tracks) {
    if (track.artwork) seen.add(track.artwork);
    if (seen.size >= max) break;
  }
  return [...seen];
}

function trackCountLabel(entry: HistoryEntry): string {
  const n = entry.trackCount ?? entry.tracks.length;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} трек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} трека`;
  return `${n} треков`;
}

export function AiMode({
  busy,
  events,
  isAdmin,
  hasDraft,
  suggestions,
  examples,
  onRefreshExamples,
  onPickPrompt,
  onOpenGeneration,
}: {
  busy: boolean;
  events: AgentEvent[];
  isAdmin?: boolean;
  /** True while the user has typed something — the idle rails give way to it. */
  hasDraft: boolean;
  suggestions: SuggestionsResponse;
  examples: string[];
  onRefreshExamples: () => void;
  onPickPrompt: (prompt: string) => void;
  onOpenGeneration: (entry: HistoryEntry) => void;
}) {
  if (busy || events.length > 0) {
    return <ReasoningTranscript events={events} active={busy} friendly={!isAdmin} />;
  }
  if (hasDraft) return null;

  const feed = buildPromptFeed(suggestions, examples);

  return (
    <>
      {feed.resume.length > 0 && (
        <section className="search-section">
          <h2 className="search-section-title">Продолжить</h2>
          <div className="resume-rail">
            {feed.resume.map((entry) => {
              const covers = coversOf(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="resume-card"
                  onClick={() => onOpenGeneration(entry)}
                  aria-label={`Открыть плейлист ${entry.playlistName ?? entry.prompt}`}
                >
                  <span className={`resume-cover resume-cover--${Math.min(covers.length, 4)}`} aria-hidden>
                    {covers.length > 0 ? (
                      covers.map((src) => <img key={src} src={src} alt="" />)
                    ) : (
                      <span className="resume-cover-blank" />
                    )}
                  </span>
                  <span className="resume-card-title">{entry.playlistName ?? entry.prompt}</span>
                  <span className="resume-card-meta">{trackCountLabel(entry)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="prompt-examples" aria-label="Примеры запросов">
        <div className="prompt-examples-head">
          <p className="prompt-examples-label">Можно начать так</p>
          <button
            type="button"
            className="prompt-examples-refresh"
            aria-label="Показать другие примеры"
            onClick={onRefreshExamples}
          >
            <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
            Ещё
          </button>
        </div>
        <div className="prompt-suggestions" aria-live="polite">
          {feed.examples.map((example) => (
            <button key={example} type="button" className="prompt-suggestion" onClick={() => onPickPrompt(example)}>
              {example}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
