# artist-pages

## ADDED Requirements

### Requirement: Search returns artist results
The search flow SHALL return artists alongside tracks. Artist results SHALL render as dedicated artist cards (name, avatar/artwork when available) visually distinct from track rows.

#### Scenario: Artists in search results
- **WHEN** user searches a query matching an artist
- **THEN** artist cards appear in the results alongside track results

#### Scenario: No artist match
- **WHEN** no artist matches the query
- **THEN** only track results are shown, with no empty artist section

### Requirement: Artist page
Tapping an artist card, or the artist name in the player, SHALL open a dedicated artist page showing the artist's top tracks and, when the backend provides them, latest albums and popular releases. Sections without data SHALL be omitted, not shown empty.

#### Scenario: Artist page content
- **WHEN** user opens an artist page
- **THEN** top tracks are listed and playable, and album/release sections appear when data exists

#### Scenario: Album drill-down
- **WHEN** user taps an album on the artist page
- **THEN** the album's tracks load using the existing album-tracks flow

### Requirement: Artist page loading and error states
The artist page SHALL show a proper loading state (skeletons) while fetching, and SHALL never render placeholder-like or partially-empty content as if it were final. Fetch failures SHALL show a retryable error state.

#### Scenario: Loading state
- **WHEN** the artist page is fetching data
- **THEN** skeleton rows are displayed instead of empty or placeholder content

#### Scenario: Fetch failure
- **WHEN** the artist fetch fails
- **THEN** an error state with a retry action is shown
