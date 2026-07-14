## ADDED Requirements

### Requirement: Global ErrorBoundary catches render errors

The application SHALL wrap the app-shell in an ErrorBoundary that catches unhandled render errors from any screen or component.

#### Scenario: Render error in any screen shows fallback UI
- **WHEN** a React component throws during rendering
- **THEN** the ErrorBoundary catches the error and the app shows a fallback UI instead of unmounting
- **AND** the error is logged to console.error with component stack trace

#### Scenario: Fallback UI has recovery action
- **WHEN** the ErrorBoundary shows the fallback UI
- **THEN** a "На главную" button is visible
- **AND** clicking it navigates to the prompt screen

#### Scenario: Error boundary resets after navigation
- **WHEN** user clicks "На главную" from the fallback
- **THEN** the error state is cleared and the app resumes normal operation

### Requirement: AdminScreen lazy-import fallback

The application SHALL handle AdminScreen lazy-import failures gracefully without crashing the entire app.

#### Scenario: AdminScreen chunk fails to load
- **WHEN** the dynamic import of AdminScreen rejects (network error, 404)
- **THEN** a fallback UI is shown with the message "Ошибка загрузки админки"
- **AND** the error is logged to console.error

#### Scenario: Retry on AdminScreen load failure
- **WHEN** the AdminScreen chunk fails to load on first attempt
- **THEN** the system SHALL automatically retry the import once
- **AND** if the retry succeeds, the AdminScreen renders normally

#### Scenario: Manual retry after repeated failure
- **WHEN** both load attempts for AdminScreen fail
- **THEN** the fallback UI includes a "Повторить" button
- **AND** clicking it triggers a new import attempt
