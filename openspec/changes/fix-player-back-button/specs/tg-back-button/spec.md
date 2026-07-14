## ADDED Requirements

### Requirement: Telegram.WebApp.BackButton integration

The Mini App SHALL integrate Telegram.WebApp.BackButton API to provide native back navigation.

#### Scenario: BackButton appears when player is open

- **WHEN** `showPlayer` becomes `true`
- **THEN** `Telegram.WebApp.BackButton.show()` is called

#### Scenario: BackButton hides when player closes

- **WHEN** `showPlayer` becomes `false` AND `history.length <= 1`
- **THEN** `Telegram.WebApp.BackButton.hide()` is called

#### Scenario: BackButton click closes player when player is open

- **WHEN** player is open AND user clicks Telegram BackButton
- **THEN** `setShowPlayer(false)` is called, closing the player overlay

#### Scenario: BackButton click navigates to previous screen when player is closed

- **WHEN** player is closed AND `history.length > 1` AND user clicks Telegram BackButton
- **THEN** history stack pops one entry, navigating to the previous screen

#### Scenario: BackButton hidden on root screen without player

- **WHEN** `history.length === 1` AND player is closed
- **THEN** `Telegram.WebApp.BackButton.hide()` is called

### Requirement: BackButton types in TelegramWebApp interface

The `TelegramWebApp` interface in `telegram.ts` SHALL declare the `BackButton` property.

#### Scenario: BackButton interface is typed

- **WHEN** accessing `Telegram.WebApp.BackButton`
- **THEN** TypeScript recognizes `{ isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; }`

### Requirement: PlayerScreen ArrowLeft still works

The existing ArrowLeft button in PlayerScreen header SHALL continue to work alongside Telegram BackButton.

#### Scenario: ArrowLeft closes player

- **WHEN** user clicks ArrowLeft in PlayerScreen header
- **THEN** `setShowPlayer(false)` is called, player closes

### Requirement: enableClosingConfirmation on active playback

When a track is actively playing, the Mini App SHALL prevent accidental close.

#### Scenario: Confirmation shown when track is playing and user tries to close

- **WHEN** `player.track !== null` AND `player.status === "playing"` AND user presses Android back button from root screen
- **THEN** Telegram shows a confirmation dialog before closing the Mini App
