## Why

Playlist relevance currently depends mostly on the LLM interpreting the raw request and the active music backend's free-text ordering. The product needs explicit genre knowledge and user feedback, but generation is already latency-sensitive, so relevance improvements must not add another model call or a network dependency to the request path.

## What Changes

- Add a bundled, versioned genre knowledge base covering Russian/English aliases, related genres, moods, eras, query terms, and representative artists.
- Resolve genre context locally and inject only a small, bounded hint into the existing agent call; uncertain requests keep the current behavior.
- Re-rank backend candidates locally using genre fit, user preferences, diversity, and negative feedback while preserving hard availability checks.
- Build a capped per-user preference snapshot from existing saves, playlists, and dislikes plus asynchronous playback feedback.
- Add fire-and-forget feedback capture for meaningful playback events without blocking playback or playlist generation.
- Add latency and behavior tests proving the enrichment performs no additional LLM or external genre-service calls.
- Voice input is explicitly out of scope.

## Capabilities

### New Capabilities

- `fast-genre-retrieval`: Local genre-intent retrieval and bounded agent context with strict no-network/no-extra-LLM latency constraints.
- `personalized-track-ranking`: Deterministic candidate re-ranking from genre fit and a capped user preference snapshot.
- `music-feedback-signals`: Non-blocking collection and storage of playback/save/dislike signals used by future generations.

### Modified Capabilities

- `player-screen`: Playback interactions emit best-effort feedback without changing or blocking player controls.

## Impact

- Server agent loop, prompt construction, music-tool dispatch, user preference storage, migrations, generation orchestration, and Mini App playback/API integration.
- Adds only bundled TypeScript data and SQLite tables/indexes; no vector database, external genre API, new runtime service, or additional LLM call.
- Existing provider/backend contracts and public generation responses remain compatible.
