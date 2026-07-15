import { useRef, useState } from "react";
import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";

const MAX_INPUT_HEIGHT = 132;

export function PromptScreen({
  onSubmit,
  busy,
}: {
  onSubmit: (prompt: string) => void;
  busy: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = !busy && prompt.trim().length > 0;

  function autoGrow() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit(prompt.trim());
  }

  return (
    <GlassPanel className="reveal prompt-card">
      <div className="prompt-pill">
        <textarea
          ref={inputRef}
          className="prompt-pill-input"
          rows={1}
          placeholder="Опишите что-нибудь…"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            autoGrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="prompt-submit"
          aria-label="Собрать плейлист"
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? <CircleNotch size={20} weight="bold" className="spin" /> : <ArrowUp size={20} weight="bold" />}
        </button>
      </div>

    </GlassPanel>
  );
}
