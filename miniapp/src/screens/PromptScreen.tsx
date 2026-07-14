import { useState } from "react";
import { Sparkle, Waveform, Lightning, Headset } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { TrackSkeleton } from "../components/TrackSkeleton";

const BENEFITS = [
  { icon: Waveform, label: "Опишите настроение" },
  { icon: Lightning, label: "Моментальная генерация" },
  { icon: Headset, label: "Поддержка 24/7" },
];

export function PromptScreen({
  onSubmit,
  busy,
}: {
  onSubmit: (prompt: string) => void;
  busy: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  return (
    <GlassPanel className="reveal">
      <div className="prompt-hero" style={{ marginBottom: 18 }}>
        <h1 style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Создать плейлист</h1>
        <p className="text-muted" style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", margin: "4px 0 0" }}>
          ◉ agent music
        </p>
      </div>

      <div className="stack" style={{ gap: 8, marginBottom: 18 }}>
        {BENEFITS.map(({ icon: Icon, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon size={18} weight="bold" />
            <span style={{ fontSize: 14 }}>{label}</span>
          </div>
        ))}
      </div>

      <div className="stack">
        <textarea
          className="glass-input"
          rows={3}
          placeholder="ночная поездка, синтвейв"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
        />
        <button
          className="glass-button primary"
          disabled={busy || prompt.trim().length === 0}
          onClick={() => onSubmit(prompt.trim())}
        >
          <Sparkle size={18} weight="fill" />
          {busy ? "Собираем плейлист…" : "Собрать плейлист"}
        </button>
        {busy && (
          <div className="mt-12">
            <TrackSkeleton />
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
