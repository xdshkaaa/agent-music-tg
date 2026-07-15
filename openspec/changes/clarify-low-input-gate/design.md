## Context

The music-curation agent resolves a user request into a playlist by calling tools inside a bounded loop (`server/core/generate-playlist.ts`). One tool, `clarify`, lets the agent ask a single disambiguating question with three options. Whether to call it is entirely the LLM's decision (`server/agent/prompts.ts` tells the model to clarify only on genuinely ambiguous requests).

Two gaps follow:

1. **Thin input wastes a generation.** A request like "музыка" or "что-нибудь" carries no usable signal. The model frequently guesses anyway, spending an LLM call plus a generation credit on a playlist the user did not want.
2. **"Own answer" is advertised but impossible in the Mini App.** `clarifySpec.description` says the reply "may be their own free-text reply", and `/api/generate/resume` already accepts any string — but `miniapp/src/screens/ClarifyScreen.tsx` only renders three buttons, so the user can never type their own answer. (The Telegram bot already accepts arbitrary text, so it is out of scope.)

Decisions were confirmed with the user:
- The gate is a **pure rule-based heuristic** (no extra LLM call).
- Free-text answering is added in the **Mini App only**.
- The gate fires on **both** very short prompts and prompts that carry no musical signal (genre/mood/artist/named-work).

## Goals / Non-Goals

**Goals:**
- Detect thin / signal-free prompts before the agent loop and return a `clarify` outcome with a fixed, localized Russian question + 3 concrete options.
- Spend no LLM call and consume no generation credit when the gate fires.
- Preserve the existing "at most one clarify per run" invariant.
- Let Mini App users answer a clarification with free text.

**Non-Goals:**
- No new LLM call to synthesize a question (heuristic only).
- No Telegram bot UI changes (already accepts free text).
- No change to the existing LLM-driven `clarify` tool or its prompt guidance.
- No API contract changes.

## Decisions

**D1. Gate lives in a new pure module `server/core/clarify-gate.ts`.**
A single exported function `evaluateClarifyGate(prompt: string): { question: string; options: string[] } | null`. Keeping it dependency-free makes it trivially unit-testable and keeps `run-generation.ts` thin. Alternatives considered: (a) forcing clarify via system-prompt injection — rejected, still spends an LLM call and is non-deterministic; (b) a dedicated pre-generation LLM call to author the question — rejected, adds latency/cost and the user chose the heuristic path.

**D2. `hasSignal(prompt)` drives the exemption.**
The gate returns `null` (no clarification) when the prompt shows *any* musical signal:
- genre keyword (RU+EN: рок, поп, джаз, техно, lo-fi, метал, инди, классич, рэп, хип-хоп, эмбиент, …),
- mood / activity keyword (грустн, весел, спокойн, энергичн, меланхол, расслаб, для сна, для бега, за рулём, приятн, душевн, …),
- named-work marker (`OST`, `soundtrack`, `саундтрек`, `album`/`альбом`, `LP`/`EP`, or a quoted title),
- artist–track pattern (`Artist — Title` via a ` - ` / ` – ` separator).

This deliberately keeps short *answerable* requests (e.g. "Persona 5 OST", "грустная музыка") from being gated, honoring `prompts.ts`.

**D3. Gate trigger rule.**
The gate returns a question when `isVeryShort(prompt) || !hasSignal(prompt)`, where `isVeryShort` is `tokenCount <= 3` (tokens = words split on whitespace/punctuation, RU+Latin). This satisfies the user's "оба случая": short prompts, and any prompt lacking musical signal regardless of length.

**D4. Fixed localized copy.**
`question` adapts: very short → "Уточните, какую музыку вы хотите услышать?"; no-signal → `Запрос «{prompt}» слишком общий — выберите направление или опишите его своими словами.` `options` is a fixed 3-item mood set (энергичное / спокойное / грустное). Copy is centralized in the gate module so it stays consistent and easy to revise.

**D5. Wiring in `startGeneration` only.**
`startGeneration` calls `evaluateClarifyGate(prompt)` first. On a non-null result it returns `{ status: "clarify", question, options, messages: [{ role: "user", content: prompt }] }` immediately — no `buildRunInputs`, no `generatePlaylist`, no `consumeAccess`. `resumeGeneration` is untouched, so the loop's `clarifyUsed = resumeMessages !== undefined` guard still blocks a second clarify.

**D6. Mini App free-text answer is UI-only.**
`ClarifyScreen` gains a free-text field plus a "Свой вариант" submit (Enter or arrow button). It calls the existing `onAnswer(text)`, which already routes through `api.generateResume` → `/api/generate/resume` and accepts any string. No server change.

## Risks / Trade-offs

- [Over-gating a verbose but signal-free prompt] → Mitigated by an inclusive `hasSignal` keyword/pattern set; the fixed question explicitly invites "опишите своими словами", so a gated-but-fine request is cheaply recoverable.
- [Keyword lists drift out of date] → Mitigated by centralizing them in `clarify-gate.ts` and covering them with unit tests; adding a word is a one-line change.
- [Gate fires then the agent still wants to clarify] → Mitigated by the existing single-clarify guard; the agent finalizes with best judgment instead of looping.
- [Localization only in Russian] → Acceptable: the product is Russian-only per `AGENTS.md`.

## Migration Plan

- Ship the heuristic + UI as a normal deploy (`deploy.sh`). No schema, env, or data changes.
- Rollback: revert the change; the gate simply disappears and behavior returns to pure LLM-driven clarify.
- No feature flag required; the gate is cheap and deterministic.

## Open Questions

- None blocking. Token threshold (`<= 3`) and the keyword lists are tuning knobs that can be adjusted after observing real traffic.
