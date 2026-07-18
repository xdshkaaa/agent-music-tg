# user-playlists

## ADDED Requirements

### Requirement: Playlist CRUD
Users SHALL be able to create named playlists, list them in the Музыка section, rename and delete them, and view a playlist's tracks. All playlist data SHALL be stored server-side per chat.

#### Scenario: Create playlist
- **WHEN** user creates a playlist with a name
- **THEN** the playlist appears in their playlist list

#### Scenario: Delete playlist
- **WHEN** user deletes a playlist
- **THEN** the playlist and its track entries are removed

### Requirement: Add track to playlist
Track rows SHALL offer an Add-to-Playlist action next to Play. It SHALL open a picker listing existing playlists plus a create-new option, and add the current track to the chosen playlist. Duplicate adds SHALL be idempotent.

#### Scenario: Add to existing playlist
- **WHEN** user taps Add-to-Playlist and picks a playlist
- **THEN** the track is added and a confirmation is shown

#### Scenario: Create-and-add
- **WHEN** user picks "create new" in the picker and names a playlist
- **THEN** the playlist is created and the track added in one flow

#### Scenario: Duplicate add
- **WHEN** the track is already in the chosen playlist
- **THEN** no duplicate entry is created and the user is informed

### Requirement: Playlist slot limits
Users SHALL be limited to 2 playlists by default. Additional playlist slots SHALL be purchasable with Telegram Stars (5⭐ per extra slot). Creation beyond the limit SHALL be blocked with a prompt offering the Stars purchase.

#### Scenario: Free limit reached
- **WHEN** a user with 2 playlists and no purchased slots creates a third
- **THEN** creation is blocked and a purchase prompt for extra slots is shown

#### Scenario: Purchased slots extend the limit
- **WHEN** a user has purchased N extra slots
- **THEN** they can hold 2 + N playlists

### Requirement: Back navigation from playlist detail
The playlist detail view SHALL show a clear Back control that returns to the Музыка section.

#### Scenario: Back to Музыка
- **WHEN** user taps Back inside a playlist
- **THEN** the Музыка section is shown with prior scroll state preserved
