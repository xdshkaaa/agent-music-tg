## ADDED Requirements

### Requirement: Detect thin or signal-free prompts
The system SHALL evaluate every generation prompt through a rule-based gate before invoking the agent. The gate SHALL return a clarification question when the prompt is very short (token count <= 3) OR when the prompt carries no musical signal (no genre keyword, no mood/activity keyword, no named-work marker, and no artist–track pattern). The gate SHALL return null (no clarification) when the prompt contains any musical signal.

#### Scenario: Very short generic prompt is gated
- **WHEN** the user submits "музыка" or "что-нибудь"
- **THEN** the gate returns a clarification question with exactly three options

#### Scenario: Signal-free long prompt is gated
- **WHEN** the user submits a prompt with no genre, mood, artist, or named-work signal
- **THEN** the gate returns a clarification question even though the prompt is long

#### Scenario: Short named work is not gated
- **WHEN** the user submits "Persona 5 OST"
- **THEN** the gate returns null and the agent runs normally

#### Scenario: Short mood request is not gated
- **WHEN** the user submits "грустная музыка"
- **THEN** the gate returns null and the agent runs normally

#### Scenario: Artist – track pattern is not gated
- **WHEN** the user submits "Imagine Dragons - Believer"
- **THEN** the gate returns null and the agent runs normally

### Requirement: Short-circuit to clarify outcome
When the gate returns a clarification question, `startGeneration` SHALL return a `clarify` outcome with the gate's question and options and the original prompt as the initial user message, WITHOUT calling the LLM provider and WITHOUT consuming a generation credit. `resumeGeneration` SHALL NOT re-run the gate.

#### Scenario: No LLM call on gated prompt
- **WHEN** `startGeneration` is called with a gated prompt
- **THEN** the provider is never invoked and the outcome status is "clarify"

#### Scenario: Credit not consumed on gated prompt
- **WHEN** `startGeneration` returns a clarify outcome from the gate
- **THEN** no access is consumed and no generation row is inserted

#### Scenario: Resume does not re-gate
- **WHEN** the user answers the gated clarification and `resumeGeneration` runs
- **THEN** the gate is not evaluated again

### Requirement: Localized clarify copy
The gated clarification SHALL use fixed Russian copy. The question for a very short prompt SHALL be "Уточните, какую музыку вы хотите услышать?". The question for a no-signal prompt SHALL incorporate the original prompt and invite a free-text description. The options SHALL be exactly three concrete moods (энергичное / спокойное / грустное).

#### Scenario: Short prompt wording
- **WHEN** the gate fires due to a very short prompt
- **THEN** the question is the short-prompt wording and options are the three fixed moods

#### Scenario: No-signal prompt wording
- **WHEN** the gate fires due to missing musical signal
- **THEN** the question references the original prompt and offers the free-text fallback
