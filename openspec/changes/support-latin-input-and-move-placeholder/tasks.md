## 1. Agent prompt: multi-script support

- [x] 1.1 Update `PLAYLIST_SYSTEM_PROMPT` in `server/agent/prompts.ts` to instruct the model to accept and interpret requests in any script (Cyrillic, Latin/transliterated Russian, English, mixed) and never treat Latin script alone as a reason to `clarify`.
- [x] 1.2 Add guidance to retry `searchTracks` with an alternate transliteration/translation of the query if the first search returns weak or no results.
- [x] 1.3 Manually verify with a transliterated Russian prompt and an English prompt that generation succeeds without spurious clarification.

## 2. Mini App: move placeholder, remove Buy screen input

- [x] 2.1 Add `placeholder="Опишите что-нибудь…"` to the prompt `<textarea>` in `miniapp/src/screens/PromptScreen.tsx`.
- [x] 2.2 Remove the "Опишите что-нибудь…" `<input>` and its `query` state/filtering wiring from `miniapp/src/screens/BuyScreen.tsx`, keeping category pill filtering intact.
- [x] 2.3 Run `bun run typecheck` and `cd miniapp && bun run build` to confirm no dangling references to the removed state.
- [x] 2.4 Manually verify in the Mini App: Create screen shows the placeholder, Buy screen no longer shows the search input and offers still filter by category.
