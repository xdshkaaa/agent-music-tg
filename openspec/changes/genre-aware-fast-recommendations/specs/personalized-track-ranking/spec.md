## ADDED Requirements

### Requirement: Capped user preference snapshot
The system SHALL build one bounded preference snapshot per generation from recent saved tracks, user playlist tracks, playback feedback, and dislikes.

#### Scenario: User has positive music history
- **WHEN** a user has saved, playlisted, or meaningfully completed tracks
- **THEN** the snapshot contains capped normalized artist weights derived from those signals

#### Scenario: User has no music history
- **WHEN** a user has no usable feedback signals
- **THEN** the snapshot is empty and global genre ranking still works

#### Scenario: User has explicit dislikes
- **WHEN** a user disliked tracks or artists
- **THEN** negative signals outweigh implicit positive playback signals and disliked URIs remain excluded from final results

### Requirement: Deterministic in-memory candidate ranking
The system SHALL re-rank only the candidates already returned by the active music backend using the resolved genre context and preference snapshot, without I/O or additional provider calls.

#### Scenario: Preferred artist is present
- **WHEN** a backend result contains an artist with a positive preference weight
- **THEN** that result receives a bounded score boost while original order remains the tie-breaker

#### Scenario: Genre representative is present
- **WHEN** a backend result artist or metadata matches the resolved genre context
- **THEN** that result receives a bounded genre-fit boost

#### Scenario: No ranking signal exists
- **WHEN** candidates match neither genre nor preference signals
- **THEN** their original backend order is preserved exactly

### Requirement: Candidate-set and latency preservation
Ranking SHALL be synchronous, SHALL NOT increase the returned candidate count, and SHALL NOT issue LLM, network, filesystem, or database calls inside the agent tool loop.

#### Scenario: Search candidates are ranked
- **WHEN** `searchTracks` returns a candidate array
- **THEN** ranking returns the same or a smaller hard-filtered set using only precomputed context
- **AND** no extra backend search is issued
