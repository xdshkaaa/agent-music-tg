import { SpeakerHigh, SpeakerLow, SpeakerX } from "@phosphor-icons/react";

export function VolumeControl({
  volume,
  muted,
  onSetVolume,
  onToggleMute,
  variant,
  stopPropagation,
}: {
  volume: number;
  muted: boolean;
  onSetVolume: (v: number) => void;
  onToggleMute: () => void;
  variant?: "bar" | "screen";
  stopPropagation?: boolean;
}) {
  const wrap =
    variant === "screen"
      ? "player-screen-volume"
      : "volume-control";

  function handle(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation();
  }

  return (
    <div className={wrap} onClick={handle}>
      <button
        type="button"
        className="icon-btn volume-icon"
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          onToggleMute();
        }}
      >
        {muted ? (
          <SpeakerX size={18} />
        ) : volume > 0.5 ? (
          <SpeakerHigh size={18} />
        ) : (
          <SpeakerLow size={18} />
        )}
      </button>
      <input
        type="range"
        className="volume-slider"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        aria-label="Громкость"
        onClick={handle}
        onChange={(e) => onSetVolume(parseFloat(e.target.value))}
      />
    </div>
  );
}
