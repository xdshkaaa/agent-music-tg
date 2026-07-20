## 1. Genre knowledge and retrieval

- [x] 1.1 Add the typed bundled genre ontology with Russian, English, and transliterated aliases
- [x] 1.2 Implement synchronous normalized genre retrieval and bounded prompt-hint formatting
- [x] 1.3 Add resolver tests for aliases, ambiguity, fallback, bounds, and no-I/O performance

## 2. Preferences and ranking

- [x] 2.1 Add a bounded user preference snapshot accessor using saves, playlists, dislikes, and feedback
- [x] 2.2 Implement deterministic in-memory candidate scoring with stable backend-order fallback
- [x] 2.3 Integrate one precomputed context/snapshot into create, resume, and extend generation flows
- [x] 2.4 Add generation and ranker tests proving there are no extra LLM or backend calls

## 3. Feedback storage and API

- [x] 3.1 Add the additive SQLite feedback migration and bounded aggregate store
- [x] 3.2 Add an authenticated validated Mini App feedback route and store tests
- [x] 3.3 Add a best-effort Mini App API client method for feedback delivery

## 4. Player feedback

- [x] 4.1 Emit deduplicated play-started, completed, and early-skip events from the shared player
- [x] 4.2 Add player tests proving event thresholds, deduplication, and failure isolation

## 5. Configuration and verification

- [x] 5.1 Add the runtime enrichment flag and document its latency/rollback behavior
- [x] 5.2 Run targeted tests, full server tests, Mini App tests, and TypeScript typecheck
- [x] 5.3 Validate the OpenSpec change and record final task completion
