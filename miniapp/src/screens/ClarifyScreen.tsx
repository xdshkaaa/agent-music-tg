import { CaretRight, CircleNotch } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";

export function ClarifyScreen({
  question,
  options,
  onAnswer,
  busy,
  reasoning,
}: {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
  busy: boolean;
  reasoning?: string | null;
}) {
  return (
    <GlassPanel className="reveal">
      <h1>Уточним детали</h1>
      <p style={{ marginBottom: 16 }}>{question}</p>
      <div className="stack">
        {options.map((option) => (
          <button
            key={option}
            className="glass-button"
            disabled={busy}
            onClick={() => onAnswer(option)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}
          >
            <span>{option}</span>
            {busy ? <CircleNotch size={16} className="spin" /> : <CaretRight size={18} weight="bold" className="chevron" />}
          </button>
        ))}
      </div>
      {busy && reasoning && (
        <p key={reasoning} className="prompt-reasoning">
          {reasoning}
        </p>
      )}
    </GlassPanel>
  );
}
