## Context

The Mini App is Russian-language, and users often type requests either in Cyrillic or in Latin script (transliterated Russian, e.g. "grustnaya muzyka", or plain English). `PLAYLIST_SYSTEM_PROMPT` (`server/agent/prompts.ts`) gives no guidance on interpreting non-Cyrillic input, so the model sometimes fails to derive a usable `searchTracks` query from Latin-script requests, causing generation to fail or clarify incorrectly. Separately, `BuyScreen.tsx` has a leftover local search input placeholdered "Опишите что-нибудь…" that is unrelated to playlist prompts (it filters credit offers) and duplicates language that belongs on the actual prompt textarea in `PromptScreen.tsx`, which currently has no placeholder.

## Goals / Non-Goals

**Goals:**
- Agent reliably interprets and searches for playlist requests regardless of script (Cyrillic, Latin/transliterated, English, mixed).
- Prompt textarea on Create screen shows "Опишите что-нибудь…" as its placeholder.
- Buy screen's offer-filter input is removed; category pills remain the only filter there.

**Non-Goals:**
- No change to `searchTracks` backend implementation (SoundCloud/YouTube) — this is purely about how the LLM forms queries and interprets input.
- No i18n framework or multi-locale UI — interface text stays Russian.

## Decisions

- **Prompt-level fix over code-level validation**: add explicit instruction to `PLAYLIST_SYSTEM_PROMPT` telling the model to accept any script/language, transliterate mentally if needed, and never treat Latin-script input as unintelligible or ambiguous by default. Rejected alternative: a pre-processing transliteration step in `server/core/generate-playlist.ts` — unnecessary complexity since the LLM can transliterate reliably given explicit instruction, and this avoids adding a new dependency (e.g. a transliteration library) for a problem that's really about model behavior, not encoding.
- **Move placeholder text, don't duplicate it**: `PromptScreen.tsx`'s textarea gets the placeholder; `BuyScreen.tsx`'s input is deleted entirely (not just re-labeled), since its filtering role is redundant with the small number of offers shown alongside category pills.

## Risks / Trade-offs

- [Prompt wording change alone may not fully fix search-query quality for heavily transliterated/slang input] → Mitigation: the existing `searchTracks` tool already does free-text search on the user's own words; instructing the model to also try an alternate transliteration/translation of the query if the first search returns weak/no results covers the common failure mode.
- [Removing BuyScreen search input reduces discoverability if offer list grows large] → Mitigation: category pills remain; offer lists are small (a handful of packages), so a filter is not load-bearing today.

## Migration Plan

No data migration. Deploy is a standard `deploy.sh` run after `bun run typecheck` and `bun run build:miniapp` pass. No rollback complexity — revert is a plain code revert.
