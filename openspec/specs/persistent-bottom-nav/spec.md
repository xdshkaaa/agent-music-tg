# persistent-bottom-nav Specification

## Purpose
TBD - created by archiving change bottom-navigation-bar. Update Purpose after archive.
## Requirements
### Requirement: Bottom navigation is always visible
The bottom navigation bar SHALL remain visible at the bottom of the viewport at all times, regardless of scroll position or page content height.

#### Scenario: Navigation bar stays visible on long content
- **WHEN** the page content is taller than the viewport and the user scrolls to the bottom of the content
- **THEN** the bottom navigation bar stays fixed at the bottom of the viewport

#### Scenario: Navigation bar stays visible on short content
- **WHEN** the page content fits within the viewport
- **THEN** the bottom navigation bar stays fixed at the bottom of the viewport

### Requirement: Tabs navigate between sections
The bottom navigation bar SHALL provide tabs for each section. Clicking a tab navigates to the corresponding section and marks the tab as active.

#### Scenario: Clicking a tab switches screen
- **WHEN** the user clicks a tab (e.g., "Профиль")
- **THEN** the app navigates to the corresponding screen and that tab shows the active state

#### Scenario: Active tab matches current screen
- **WHEN** the user navigates to a screen (e.g., "Магазин")
- **THEN** the corresponding tab ("Магазин") is visually marked as active

### Requirement: Content is not hidden behind the fixed bar
The main content area SHALL have sufficient bottom padding so that the last content element is not obscured by the fixed bottom navigation bar.

#### Scenario: Last content element is visible
- **WHEN** the user scrolls to the very bottom of the page content
- **THEN** the last content element is visible above the fixed bottom navigation bar

### Requirement: PlayerBar adjusts position
The PlayerBar SHALL remain positioned above the fixed bottom navigation bar.

#### Scenario: PlayerBar above navigation bar
- **WHEN** a track is loaded and the PlayerBar is shown
- **THEN** the PlayerBar appears directly above the bottom navigation bar without overlapping

