## Why

Today the `clarify` tool is entirely LLM-driven: the agent decides (up to once per run) whether a request is ambiguous enough to ask a clarifying question. When a user sends a very thin or signal-free request (e.g. "музыка", "что-нибудь", "песни послушать"), the model often guesses anyway and produces a playlist that misses the point, wasting an LLM call and a generation credit. We also advertise that clarify accepts a free-text reply, but the Mini App only renders three fixed option buttons, so users cannot actually type their own answer.

## What Changes

- Add a server-side **rule-based clarify gate** that runs before the agent loop. If the incoming prompt is very short OR carries no musical signal (no genre/mood/artist/named-work markers), the harness immediately returns a `clarify` outcome with a fixed, localized Russian question and three concrete mood options — no LLM call, no credit consumed.
- The gate must **not** fire for prompts that are already answerable: named works (`OST`, `soundtrack`, album titles), a recognizable artist, or a genre/mood keyword. This preserves the existing behavior where `prompts.ts` treats short named works as answerable.
- Add a **"type your own answer"** free-text field to the Mini App `ClarifyScreen`, so users can answer with their own words instead of only picking one of the three options. The server already accepts any string via `/api/generate/resume`, so no server change is needed for this part.
- The existing "at most one clarify per run" invariant is preserved: the gate fires only in `startGeneration`, and a resumed run still cannot trigger a second clarify.

## Capabilities

### New Capabilities
- `clarify-gate`: Server-side heuristic that detects thin / signal-free prompts and forces a single clarification round (fixed Russian question + 3 options) before any LLM call.
- `clarify-free-answer`: Mini App clarify UI enhancement that lets the user submit a free-text answer ("Свой вариант") in addition to the three preset options.

### Modified Capabilities
<!-- No existing spec-level requirements change. -->

## Impact

- New file `server/core/clarify-gate.ts` (pure, dependency-free heuristic + fixed copy).
- `server/core/run-generation.ts`: `startGeneration` calls the gate first and short-circuits to a `clarify` outcome when triggered.
- `miniapp/src/screens/ClarifyScreen.tsx`: adds a free-text input + submit affordance (keeps existing option buttons).
- No changes to the Telegram bot (it already accepts arbitrary text as a clarify answer).
- No API contract changes: `POST /api/generate` and `POST /api/generate/resume` keep their current shapes.
- Tests: new `server/core/clarify-gate.test.ts` plus an integration assertion in the generation test suite that `startGeneration` returns `clarify` for a thin prompt without invoking the provider.
