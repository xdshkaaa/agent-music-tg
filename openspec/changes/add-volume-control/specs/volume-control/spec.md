## ADDED Requirements

### Requirement: Set volume programmatically
The player SHALL expose `setVolume(volume: number)` to set audio playback level, where volume is a float from 0 (silent) to 1 (max).

The player SHALL apply the volume to the underlying `HTMLAudioElement.volume` immediately.

The player SHALL persist the volume level to `localStorage` under key `player:volume` on every change.

#### Scenario: Set volume to 0.5
- **WHEN** `player.setVolume(0.5)` is called
- **THEN** `audio.volume` equals 0.5
- **THEN** `localStorage.getItem("player:volume")` returns `"0.5"`

#### Scenario: Set volume to 0
- **WHEN** `player.setVolume(0)` is called
- **THEN** `audio.volume` equals 0

#### Scenario: Set volume to 1
- **WHEN** `player.setVolume(1)` is called
- **THEN** `audio.volume` equals 1

### Requirement: Mute toggle
The player SHALL expose `toggleMute()` to mute and unmute audio.

When muted, the player SHALL store the current volume in a ref so it can be restored on unmute.

When unmuted, the player SHALL restore the volume level that was active before muting.

Muting SHALL set `audio.volume = 0`.

#### Scenario: Toggle mute on
- **WHEN** volume is 0.7 and `player.toggleMute()` is called
- **THEN** `audio.volume` equals 0

#### Scenario: Toggle mute off restores previous volume
- **WHEN** volume is 0.7, `player.toggleMute()` is called, then `player.toggleMute()` is called again
- **THEN** `audio.volume` equals 0.7

### Requirement: Volume state in context
The player context SHALL expose `volume: number` (0–1, current level) and `muted: boolean` (whether muted) as part of the state.

#### Scenario: State reflects volume change
- **WHEN** `player.setVolume(0.3)` is called
- **THEN** `player.volume` equals 0.3

#### Scenario: State reflects mute
- **WHEN** `player.toggleMute()` is called
- **THEN** `player.muted` equals true

### Requirement: Restore volume on init
The player SHALL read `localStorage.getItem("player:volume")` on mount and apply it. If the key is absent, default volume SHALL be 0.7.

#### Scenario: Restore saved volume
- **WHEN** `localStorage` has `player:volume` = `"0.5"`
- **THEN** on mount `audio.volume` equals 0.5

#### Scenario: Default volume
- **WHEN** `localStorage` has no `player:volume` key
- **THEN** on mount `audio.volume` equals 0.7

### Requirement: Volume slider in PlayerBar
The PlayerBar SHALL render a volume slider control consisting of a volume icon button and an `<input type="range">`.

The icon SHALL reflect the current state: `SpeakerX` when muted, `SpeakerHigh` when volume > 0.5, `SpeakerLow` otherwise.

Clicking the icon SHALL call `toggleMute()`.

The range input SHALL have min=0, max=1, step=0.05, and value bound to `player.volume`.

On input change, the player SHALL call `player.setVolume(parseFloat(e.target.value))`.

#### Scenario: Icon shows SpeakerX when muted
- **WHEN** player is muted
- **THEN** icon rendered is `SpeakerX`

#### Scenario: Icon shows SpeakerHigh when volume > 0.5
- **WHEN** volume is 0.7 and not muted
- **THEN** icon rendered is `SpeakerHigh`

#### Scenario: Icon shows SpeakerLow when volume ≤ 0.5
- **WHEN** volume is 0.3 and not muted
- **THEN** icon rendered is `SpeakerLow`

#### Scenario: Clicking icon toggles mute
- **WHEN** user clicks the volume icon
- **THEN** `toggleMute()` is called

#### Scenario: Slider changes volume
- **WHEN** user sets range input to 0.8
- **THEN** `player.setVolume(0.8)` is called

### Requirement: Glass-styled range input
The volume range input SHALL be styled with the app's glass design system: accent-colored track fill, hairline track background, custom thumb, consistent with the existing progress bar aesthetics.

On narrow viewports (< 360px width) the range input SHALL be hidden, leaving only the volume icon (mute toggle).

#### Scenario: Hidden on narrow screens
- **WHEN** viewport width is less than 360px
- **THEN** the range input is hidden, icon remains visible

### Requirement: localStorage error resilience
If `localStorage` is unavailable (e.g. iOS Telegram WebView restricted context), all volume operations SHALL gracefully degrade — no crash, no thrown error.

#### Scenario: localStorage unavailable
- **WHEN** `localStorage.setItem` throws
- **THEN** the player continues to work, volume changes apply to audio but are not persisted
