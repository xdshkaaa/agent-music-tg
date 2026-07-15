## ADDED Requirements

### Requirement: Multi-script prompt interpretation
The playlist-generation agent SHALL correctly interpret user requests written in Cyrillic, Latin script (including transliterated Russian), English, or mixed script, without treating Latin-script input as unintelligible or automatically ambiguous.

#### Scenario: Transliterated Russian request
- **WHEN** a user submits a request written in transliterated Russian (Latin letters spelling Russian words, e.g. "grustnaya muzyka dlya dozhdya")
- **THEN** the agent calls `searchTracks` with a usable query derived from the request and proceeds to build a playlist, without calling `clarify` solely because the script is Latin

#### Scenario: English mood request
- **WHEN** a user submits a request in plain English (e.g. "sad rainy day music")
- **THEN** the agent calls `searchTracks` and finalizes a playlist the same way it would for an equivalent Cyrillic request

#### Scenario: Mixed-script request
- **WHEN** a user submits a request mixing Cyrillic and Latin script (e.g. an artist name in Latin plus a mood in Cyrillic)
- **THEN** the agent interprets both parts and forms a coherent search query covering the full intent
