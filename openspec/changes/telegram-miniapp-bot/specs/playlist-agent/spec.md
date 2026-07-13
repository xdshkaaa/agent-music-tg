## ADDED Requirements

### Requirement: Mood-to-playlist agent loop
The system SHALL accept a free-text mood/request from an allowed chat and SHALL drive a bounded, multi-turn LLM tool-calling loop against the active music backend's search capability to select tracks, rather than asking the LLM to hallucinate a track list directly.

#### Scenario: Successful generation
- **WHEN** an allowed chat submits a mood/request (e.g. "late night driving synthwave")
- **THEN** the system runs the tool loop against the active music backend and returns a resolved track list

#### Scenario: Loop exceeds iteration bound
- **WHEN** the tool loop reaches its maximum iteration count without the model calling finalize
- **THEN** the system stops the loop and reports a generation error to the chat instead of hanging indefinitely

#### Scenario: Duplicate tool call guard
- **WHEN** the model issues a tool call with arguments identical to a prior call in the same loop
- **THEN** the system returns the cached prior result instead of re-dispatching the call

### Requirement: At most one clarifying question per generation
The system SHALL allow the agent to ask at most one clarifying question per generation request before finalizing, and SHALL surface that question to the user through the bot/Mini App and resume the loop with their answer.

#### Scenario: Agent asks a clarifying question
- **WHEN** the agent's tool loop calls the clarify tool once
- **THEN** the system presents the question to the user and waits for their reply before continuing the loop

#### Scenario: Agent attempts a second clarifying question
- **WHEN** the agent's tool loop attempts to call the clarify tool again in the same generation
- **THEN** the system does not present a second question and instructs the model to finalize with its current information

### Requirement: Playlist finalization is backend-dependent
The system SHALL finalize a successful generation according to the active music backend's capabilities: creating a real remote playlist when the backend supports it, or returning a resolved track list with deep links when it does not.

#### Scenario: Finalize against a playlist-capable backend
- **WHEN** the active music backend supports remote playlist creation
- **THEN** finalizing a generation creates a playlist on that backend and returns its identifier/link to the user

#### Scenario: Finalize against a resolve-only backend
- **WHEN** the active music backend does not support remote playlist creation
- **THEN** finalizing a generation returns the resolved track list with per-track deep links, without attempting to create a playlist

### Requirement: Active AI provider selection
The system SHALL route generation requests through whichever AI provider is currently marked active (see `access-control`'s admin-only provider setting), and SHALL reject a generation request with a clear error if the active provider's required credential is not configured.

#### Scenario: Active provider is configured
- **WHEN** a generation request runs and the active provider has its required API key set
- **THEN** the system uses that provider to drive the tool loop

#### Scenario: Active provider is missing its credential
- **WHEN** a generation request runs and the active provider's required API key is unset
- **THEN** the system fails the request with an error identifying the missing credential, without attempting a call
