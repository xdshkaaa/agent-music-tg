## ADDED Requirements

### Requirement: Local genre knowledge retrieval
The system SHALL resolve genre knowledge from a bundled dataset in process without database, filesystem, network, music-provider, or LLM calls.

#### Scenario: Recognized Russian genre alias
- **WHEN** a request contains a known Russian genre alias
- **THEN** the resolver returns its canonical genre, related genres, moods, and search terms synchronously

#### Scenario: Recognized English or transliterated alias
- **WHEN** a request contains a known English or Russian-transliterated alias
- **THEN** the resolver maps it to the same canonical genre as its Russian alias

#### Scenario: Unknown request
- **WHEN** no genre alias or sufficiently strong mood mapping is found
- **THEN** the resolver returns no genre hint and generation preserves the existing behavior

### Requirement: Bounded agent enrichment
The system SHALL append at most one fixed-size genre hint to the existing agent system prompt and SHALL NOT make an additional LLM call or agent iteration to classify the request.

#### Scenario: Genre context is available
- **WHEN** local retrieval finds a confident match
- **THEN** the first existing LLM call receives a bounded hint with canonical genres and a small number of search terms or representative artists

#### Scenario: Genre context is unavailable
- **WHEN** local retrieval finds no confident match
- **THEN** the system prompt and LLM call count remain equivalent to the unenriched flow

### Requirement: Runtime fallback
The system SHALL support disabling recommendation enrichment through configuration without deleting stored feedback.

#### Scenario: Enrichment is disabled
- **WHEN** the runtime enrichment flag is false
- **THEN** no genre hint or personalized candidate re-ranking is applied
- **AND** playlist generation continues with the existing provider and music backend
