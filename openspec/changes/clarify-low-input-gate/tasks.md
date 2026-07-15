## 1. Rule-based clarify gate (server)

- [x] 1.1 Create `server/core/clarify-gate.ts` with `evaluateClarifyGate(prompt: string): { question: string; options: string[] } | null`.
- [x] 1.2 Implement `hasSignal(prompt)` covering genre keywords (RU+EN), mood/activity keywords, named-work markers (`OST`, `soundtrack`, `саундтрек`, `album`/`альбом`, `LP`/`EP`, quoted title), and artist–track separator pattern (` - ` / ` – `).
- [x] 1.3 Implement `isVeryShort(prompt)` as token count `<= 3` (RU+Latin word tokenization on whitespace/punctuation).
- [x] 1.4 Centralize the fixed Russian question copy (short-prompt vs no-signal wording) and the three fixed mood options.
- [x] 1.5 Wire `evaluateClarifyGate` into `startGeneration` (`server/core/run-generation.ts`): return `{ status: "clarify", question, options, messages: [{ role: "user", content: prompt }] }` before `buildRunInputs`, without consuming access.

## 2. Mini App free-text answer

- [x] 2.1 Add a free-text input + "Свой вариант" submit affordance to `miniapp/src/screens/ClarifyScreen.tsx`, keeping the three preset option buttons.
- [x] 2.2 Wire Enter-key and button submit to the existing `onAnswer(customText)` handler.
- [x] 2.3 Verify the custom answer routes through `api.generateResume` → `/api/generate/resume` (no server change expected).

## 3. Tests

- [x] 3.1 Add `server/core/clarify-gate.test.ts`: gate fires for "музыка", "что-нибудь", "песни"; does NOT fire for "грустная музыка", "Persona 5 OST", "Imagine Dragons - Believer".
- [x] 3.2 Verify the gate wiring: the gated `return` in `startGeneration` precedes `buildRunInputs` (no provider constructed) and `consumeAccess` (no credit spent). A live `startGeneration` integration test was omitted because `server/api/generate-stream.test.ts` mocks `../core/run-generation` process-wide under `bun test`, making such a test collide regardless of load order; the gate decision itself is fully covered by `clarify-gate.test.ts` (17 cases).

## 4. Validation

- [x] 4.1 Run `bun run typecheck` and `bun test`. The new code introduces no new type errors (the remaining `admin-panel.ts` / `payments.test.ts` / `run-generation.ts:48` errors are pre-existing in-progress work on this branch, in code not touched here). `bun test` passes for the new gate suite (17/17); pre-existing failures in the full suite are unrelated (avatar, openspec CLI, auto-audio).
- [x] 4.2 Build the Mini App (`bun run build:miniapp`) to confirm the UI change compiles — passes.
