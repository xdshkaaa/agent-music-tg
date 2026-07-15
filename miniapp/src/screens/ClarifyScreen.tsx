import { useState } from "react";
import { ArrowUp, CaretRight, CircleNotch } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { ReasoningTranscript } from "../components/ReasoningTranscript";
import type { AgentEvent } from "../lib/reasoning";

export function ClarifyScreen({
  question,
  options,
  onAnswer,
  busy,
  events,
  isAdmin,
}: {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
  busy: boolean;
  events: AgentEvent[];
  isAdmin?: boolean;
}) {
  const [custom, setCustom] = useState("");

  const canSubmitCustom = !busy && custom.trim().length > 0;

  function submitCustom() {
    if (!canSubmitCustom) return;
    onAnswer(custom.trim());
  }

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

      <div className="prompt-pill clarify-own">
        <textarea
          className="prompt-pill-input"
          rows={1}
          placeholder="Или напишите свой вариант…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitCustom();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="prompt-submit"
          aria-label="Отправить свой вариант"
          disabled={!canSubmitCustom}
          onClick={submitCustom}
        >
          {busy ? <CircleNotch size={20} weight="bold" className="spin" /> : <ArrowUp size={20} weight="bold" />}
        </button>
      </div>

      {events.length > 0 && <ReasoningTranscript events={events} collapsed={!busy} friendly={!isAdmin} />}
    </GlassPanel>
  );
}
