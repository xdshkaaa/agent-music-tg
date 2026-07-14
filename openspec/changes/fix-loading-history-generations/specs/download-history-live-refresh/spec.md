## ADDED Requirements

### Requirement: New downloads appear without tab switch

When a user initiates a download from ResultsScreen and then navigates to Profile → «Загрузки», the new download entry SHALL be visible without switching away and back.

#### Scenario: ResultsScreen signals ProfileScreen after download
- **WHEN** user clicks «Скачать» on ResultsScreen AND the API returns 202
- **THEN** a `download-created` custom event SHALL be dispatched on `window`
- **AND** ProfileScreen SHALL increment its download refresh counter upon receiving this event

#### Scenario: ProfileScreen fetches downloads on refresh signal
- **WHEN** ProfileScreen receives the `download-created` event
- **THEN** it SHALL call `GET /api/downloads` and update the displayed list

### Requirement: Download statuses update in real time

While the user is viewing the «Загрузки» tab, download statuses SHALL update automatically as background jobs progress, without requiring manual refresh.

#### Scenario: Polling starts when active downloads exist
- **WHEN** «Загрузки» tab is active AND any download has status `pending` or `processing`
- **THEN** the component SHALL poll `GET /api/downloads` every 5 seconds

#### Scenario: Polling stops when all downloads are terminal
- **WHEN** all downloads have terminal status (`done`, `partial`, `failed`)
- **THEN** polling SHALL stop

#### Scenario: Status transitions reflected in UI
- **WHEN** a download's status changes from `pending` to `processing` during polling
- **THEN** the label SHALL update from «в очереди» to «отправляется…»
- **AND** when status changes to `done`, the label SHALL update to «готово»

#### Scenario: Polling does not fire after unmount
- **WHEN** user navigates away from «Загрузки» tab OR component unmounts
- **THEN** the polling interval SHALL be cleared

### Requirement: No unnecessary network requests

The polling mechanism SHALL avoid redundant requests when there is nothing to update.

#### Scenario: No polling on initial load with no active downloads
- **WHEN** «Загрузки» tab mounts AND all existing downloads have terminal statuses
- **THEN** no polling interval SHALL be started
