## ADDED Requirements

### Requirement: Free-text answer on the clarify screen
The Mini App `ClarifyScreen` SHALL present, in addition to the three preset option buttons, a free-text input that lets the user submit their own answer ("Свой вариант"). Submitting the free-text answer SHALL invoke the same answer handler as the preset options.

#### Scenario: User submits custom text
- **WHEN** the user types text into the free-text field and submits it
- **THEN** the clarify answer handler is called with that exact text and generation resumes

#### Scenario: Enter key submits custom text
- **WHEN** the user types text and presses Enter in the free-text field
- **THEN** the custom answer is submitted

#### Scenario: Preset options remain available
- **WHEN** the clarify screen is shown
- **THEN** the three preset option buttons are still rendered alongside the free-text field

### Requirement: Free-text answer routes through existing resume API
The custom free-text answer SHALL be sent through the existing `/api/generate/resume` endpoint (any non-empty string), requiring no server-side change beyond what already exists.

#### Scenario: Non-empty custom answer accepted
- **WHEN** a non-empty custom answer is submitted
- **THEN** the resume endpoint accepts it and continues generation with that answer
