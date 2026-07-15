## Why

Users typing requests in Latin script (e.g. transliterated Russian, English mood descriptions) frequently get rejected or produce broken playlists — the agent's system prompt gives no explicit guidance to handle non-Cyrillic input, so the model's search-query generation is inconsistent for Latin-script requests. Separately, the Buy screen carries a leftover "Опишите что-нибудь…" input (a local filter for credit offers) that visually duplicates the real prompt textarea on the Create screen, which has no placeholder at all — confusing users about where to actually type their request.

## What Changes

- Update `PLAYLIST_SYSTEM_PROMPT` (`server/agent/prompts.ts`) to explicitly instruct the model to accept and correctly interpret requests in any language or script (Cyrillic, Latin/transliterated Russian, English, mixed), and to transliterate/translate as needed when forming `searchTracks` queries.
- Add the placeholder text "Опишите что-нибудь…" to the real prompt `<textarea>` on `PromptScreen.tsx` (currently has no placeholder).
- Remove the "Опишите что-нибудь…" filter `<input>` from `BuyScreen.tsx` (the offers list search box), since it's unrelated to prompt generation and duplicates the phrase misleadingly. Category pill filtering on Buy screen remains unaffected.

## Capabilities

### New Capabilities
- `prompt-language-support`: the agent accepts and correctly interprets playlist requests in Cyrillic, Latin/transliterated Russian, English, or mixed script.

### Modified Capabilities
(none)

## Impact

- `server/agent/prompts.ts` — system prompt wording change (no breaking API change).
- `miniapp/src/screens/PromptScreen.tsx` — add placeholder attribute to textarea.
- `miniapp/src/screens/BuyScreen.tsx` — remove search input and its state/filtering wiring for offers (category pills remain).
