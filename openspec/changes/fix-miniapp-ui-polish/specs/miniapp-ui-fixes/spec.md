# miniapp-ui-fixes Specification

## ADDED Requirements

### Requirement: Profile top-up button is normally sized
The «Пополнить» button in the profile balance card SHALL NOT stretch to the full height of the balance text column. It SHALL render at standard button height (matching `.glass-button` padding), vertically centered against the balance block, and SHALL NOT exceed roughly half the card width.

#### Scenario: Balance card layout is balanced
- **WHEN** the profile screen renders with balance, trial line, and subscription line
- **THEN** the «Пополнить» button height equals the standard button height and does not span the entire column height

#### Scenario: Long balance text does not inflate the button
- **WHEN** the trial and subscription lines are both present (three text rows)
- **THEN** the button remains standard height and stays vertically centered

### Requirement: Prompt hero never clips
The «Создать плейлист» hero title on the prompt screen SHALL be fully visible inside the card at all supported viewport widths (320–480 px), with no glyph clipping against the card edge or the panel's rounded corner/overflow mask.

#### Scenario: Title fits narrow viewport
- **WHEN** the prompt screen renders at 320 px width
- **THEN** the full uppercase title is visible with padding between text and card edges

#### Scenario: Title fits during reveal animation
- **WHEN** the reveal animation plays on screen enter
- **THEN** no frame shows the title clipped by the panel's `overflow: hidden`

### Requirement: Prompt textarea has no resize handle
The prompt textarea SHALL NOT display a manual resize handle; it uses `resize: none` (auto-growing behavior optional).

#### Scenario: No resize affordance
- **WHEN** the prompt textarea renders
- **THEN** the browser resize grip is absent

### Requirement: Horizontally scrollable control rows signal overflow
Rows that scroll horizontally (`.segmented` with overflowing options, `.admin-tabs`) SHALL show an edge-fade affordance on the side(s) where content is clipped, so partially visible items read as scrollable rather than broken.

#### Scenario: Admin tabs overflow right
- **WHEN** admin tab labels exceed the container width
- **THEN** the right edge shows a fade mask and the row scrolls horizontally

#### Scenario: Fade disappears at scroll end
- **WHEN** the user scrolls the row fully to the right
- **THEN** the right-edge fade is removed (and appears on the left edge instead)

#### Scenario: Segmented control with many options
- **WHEN** the AI-provider segmented control renders more options than fit (e.g. 4 providers)
- **THEN** the clipped side shows the fade affordance

### Requirement: Dock active state is consistent
The bottom navigation SHALL always show the indicator pill and the accent-colored label on the same tab. Indicator geometry SHALL be recomputed when the tab set changes (admin tab appears), when fonts finish loading, and on container resize.

#### Scenario: Tab switch keeps state in sync
- **WHEN** the user switches from «Создать» to «Магазин»
- **THEN** after the morph animation completes, both the pill and the accent color are on «Магазин», and at no point does a non-active tab show accent color without an animating pill toward it

#### Scenario: Admin tab appears after auth
- **WHEN** `/api/me` resolves and the «Админ» tab is appended
- **THEN** the indicator stays exactly under the currently active tab

### Requirement: Admin statistics rendered as stat rows
The admin statistics panel SHALL render each metric as a labeled row (muted label + emphasized value) instead of plain paragraphs.

#### Scenario: Stats display
- **WHEN** the stats panel loads with users/purchases/revenue
- **THEN** each metric shows a muted label and a visually emphasized value, consistent with the glass design system
