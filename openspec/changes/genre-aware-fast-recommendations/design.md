## Context

The agent currently sends the raw request to one bounded tool-calling loop. `searchTracks` returns the backend's native order, while dislikes are injected into the conversation and hard-filtered at finalization. SQLite already stores generations, saved tracks, playlists, and dislikes. Generation latency is dominated by LLM and music-provider network calls, so the change must improve their inputs and ordering without adding another remote hop.

## Goals / Non-Goals

**Goals:**

- Recognize common genre, subgenre, mood, era, and Russian/transliterated aliases locally.
- Give the existing agent a small, useful curation hint in the same LLM request.
- Re-rank existing backend candidates deterministically from genre and user signals.
- Capture playback feedback asynchronously for later generations.
- Preserve current fallback behavior and provider compatibility.
- Make latency invariants directly testable.

**Non-Goals:**

- Voice input, speech recognition, model fine-tuning, embeddings, or a vector database.
- Loading a full external music catalog into the application database.
- Calling Wikidata, MusicBrainz, Last.fm, or another metadata service during generation.
- Replacing YouTube Music or SoundCloud search.

## Decisions

### Use a bundled in-memory genre ontology

The server will ship a versioned TypeScript dataset containing canonical genre ids, aliases, related genres, moods, query terms, and representative artists. Importing it builds immutable lookup maps once per process. Retrieval is a synchronous normalized token/phrase match with deterministic confidence and no I/O.

Alternative considered: vector retrieval or a remote metadata API. Rejected for the first version because it adds infrastructure, cold starts, network failure modes, and request latency. The local interface can later be backed by a larger index without changing generation orchestration.

### Enrich the existing call instead of adding an intent-model call

`startGeneration` and resume/extend flows will build one recommendation context before entering `generatePlaylist`. A concise hint, capped to a fixed character budget, is appended to the existing system prompt. The hint states that it is advisory and must not cause extra searches by itself. No new provider call or agent iteration is introduced.

Alternative considered: a separate structured-output LLM classifier. Rejected because it would nearly double model-bound latency and cost.

### Re-rank, do not replace, backend candidates

The tool dispatcher will accept an optional synchronous candidate-ranker. For `searchTracks` and artist-top-track results, it will reorder the exact candidate set returned by the backend using stable scores:

1. hard-negative URI filtering remains authoritative at finalization;
2. preferred artists from saved/playlist/playback signals receive a bounded boost;
3. representative artists and terms associated with the resolved genre receive a bounded boost;
4. stable original rank remains the tie-breaker.

The ranker will not perform I/O, invent tracks, or expand the result count. Artist-diversity enforcement remains with the agent/finalization rules.

### Build one capped preference snapshot per generation

A server accessor will query a bounded number of recent positive and negative signals and normalize them into preferred/disliked artist weights. The snapshot is computed once before the agent loop and reused by every tool call. Existing dislike URI filtering remains unchanged. All SQL is indexed and bounded.

### Capture feedback out of band

A small authenticated Mini App endpoint will accept `play_started`, `play_completed`, and `skipped` events for a concrete backend URI. The player will send them best-effort with deduplication and thresholds; failed feedback requests are ignored and never block playback. Save/dislike sources already stored by the product are folded into the snapshot directly rather than duplicated synchronously.

### Keep a reversible runtime switch

An environment boolean enables recommendation enrichment. Disabling it restores the prior prompt and candidate order while leaving collected feedback intact. The database migration is additive and does not require rollback.

## Risks / Trade-offs

- [Bundled taxonomy has incomplete long-tail coverage] → return no hint below confidence threshold and keep the existing agent behavior; grow the dataset from evaluated queries.
- [More prompt tokens could slightly affect model latency] → cap the hint tightly and include only the top genre matches and a few terms/artists.
- [Implicit playback signals can be noisy] → use conservative weights, require completion thresholds, cap history, and keep explicit dislikes strongest.
- [Mini App can duplicate events during rerenders] → deduplicate per track/session client-side and upsert coarse counters server-side.
- [Personal data retention] → store only chat id, backend URI, track metadata, event counters, and timestamps; never store audio or voice data.

## Migration Plan

1. Apply the additive SQLite migration and indexes.
2. Deploy code with enrichment enabled; no backfill is required because existing saves/playlists/dislikes already seed profiles.
3. Verify unit tests and compare generation traces to confirm the same number of model calls and backend searches for fixed fake-agent runs.
4. If relevance or latency regresses, disable enrichment through the environment switch and restart; feedback rows can remain safely unused.

## Open Questions

- The first ontology is intentionally curated and compact. Expansion from external CC0 sources should be a separate offline ingestion change after production evaluation identifies missing genres.
