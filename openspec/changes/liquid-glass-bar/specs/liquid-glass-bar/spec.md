## ADDED Requirements

### Requirement: Liquid-glass dock background
The dock SHALL use a semi-transparent glass background with `backdrop-filter: blur(24px) saturate(160%)` instead of a solid color. The dock SHALL retain a `border-top` for visual separation from content.

#### Scenario: Dock renders with glass effect
- **WHEN** the BottomNav component mounts
- **THEN** the `.dock` element has `background` with alpha transparency and `backdrop-filter: blur()`

#### Scenario: Content scrolls beneath dock
- **WHEN** user scrolls page content
- **THEN** the content behind the dock is visible through the glass effect

### Requirement: Animated active tab indicator
The active tab in BottomNav SHALL be indicated by a morphing pill element that animates its position and width smoothly between tabs. The tab button itself SHALL NOT use background color for active state.

#### Scenario: Indicator moves to clicked tab
- **WHEN** user clicks a non-active tab button
- **THEN** the indicator pill animates its `translateX` and `width` to the clicked tab's position within `var(--liquid-morph-duration)`

#### Scenario: Indicator initial position
- **WHEN** BottomNav mounts with active tab "create"
- **THEN** the indicator pill is positioned behind the "Создать" button

### Requirement: PlayerBar liquid glow
The PlayerBar SHALL display an animated gradient glow effect on its border when a track is loaded.

#### Scenario: Glow animation plays
- **WHEN** PlayerBar is visible with a track
- **THEN** the bar SHALL show a `conic-gradient` border animation that rotates continuously

#### Scenario: Glow disabled with reduced motion
- **WHEN** user has `prefers-reduced-motion: reduce` set
- **THEN** the gradient border animation SHALL be静止 (paused)

### Requirement: Unified glass tokens
The CSS `:root` SHALL define liquid-glass design tokens: `--liquid-glow`, `--liquid-border-gradient`, `--liquid-morph-duration`, `--liquid-morph-easing`.

#### Scenario: Tokens are available
- **WHEN** any bar component references liquid-glass tokens
- **THEN** the tokens resolve to valid CSS values

### Requirement: AdminSettingsBar visual alignment
The AdminSettingsBar SHALL use the same border-radius, padding, and glass background tokens as BottomNav for visual consistency.

#### Scenario: Consistent styling
- **WHEN** AdminSettingsBar and BottomNav are both rendered
- **THEN** they share identical `border-radius`, glass background opacity, and backdrop-filter values
