import { GlassPanel } from "../components/GlassPanel";

export function ClarifyScreen({
  question,
  options,
  onAnswer,
  busy,
}: {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
  busy: boolean;
}) {
  return (
    <GlassPanel>
      <h1>Quick question</h1>
      <p style={{ marginBottom: 16 }}>{question}</p>
      <div className="stack">
        {options.map((option) => (
          <button key={option} className="glass-button" disabled={busy} onClick={() => onAnswer(option)}>
            {option}
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
