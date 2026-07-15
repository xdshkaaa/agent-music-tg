## MODIFIED Requirements

### Requirement: Glass background with visible blur

The top bar background SHALL use `--lg-v2-panel` (the liquid-glass v2 panel token) instead of opaque color-mix, rendered as a floating **pill** (`border-radius: 999px`) with `backdrop-filter: blur(28px) saturate(180%)`. It SHALL sit `position: sticky; top: 12px` and float above content rather than being a full-width rectangular sticky bar with a bottom border.

#### Scenario: Dark scheme glass background
- **WHEN** `data-scheme` attribute on `<html>` is `"dark"` or absent
- **THEN** the top bar background SHALL be `var(--lg-v2-panel)` and `backdrop-filter` SHALL be `blur(28px) saturate(180%)`

#### Scenario: Light scheme glass background
- **WHEN** `data-scheme` attribute on `<html>` is `"light"`
- **THEN** the top bar background SHALL be `var(--lg-v2-panel)` (light variant) and `backdrop-filter` SHALL be `blur(28px) saturate(180%)`

#### Scenario: Content visible through header
- **WHEN** content scrolls under the sticky top bar
- **THEN** the content SHALL be visibly blurred through the floating pill header background

### Requirement: Wallet pill integrated styling

The `.wallet-pill` SHALL use a subtle chip background without a visible border, to appear as part of the glass surface. This requirement is unchanged in behavior but the pill now lives inside the floating `.app-top-bar` pill.

#### Scenario: Wallet pill appearance
- **WHEN** the wallet pill is rendered in the top bar
- **THEN** it SHALL have no visible `border` and SHALL use `background: var(--lg-v2-chip)` with the `--lg-v2-specular` inset highlight

### Requirement: Theme toggle control

The top bar SHALL provide a **theme toggle** button (sun/moon icon) that flips the app's color scheme. Activating it SHALL set `data-scheme` on `<html>` to the opposite of the current scheme (`light` ↔ `dark`) and persist the choice. The button SHALL reflect the scheme it will switch *to* (e.g. show a sun icon when the current scheme is dark).

#### Scenario: Toggling from dark to light
- **WHEN** the current scheme is `dark` and the user taps the toggle
- **THEN** `data-scheme` on `<html>` becomes `light`, the choice persists, and the UI re-themes

#### Scenario: Toggling from light to dark
- **WHEN** the current scheme is `light` and the user taps the toggle
- **THEN** `data-scheme` on `<html>` becomes `dark`, the choice persists, and the UI re-themes

#### Scenario: Icon reflects target scheme
- **WHEN** the toggle button is rendered
- **THEN** it shows the icon for the scheme it will switch to (sun when dark, moon when light)
