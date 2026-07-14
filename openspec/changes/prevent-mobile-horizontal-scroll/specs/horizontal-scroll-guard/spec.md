## ADDED Requirements

### Requirement: Root-level horizontal scroll lock
The app shell SHALL prevent any horizontal overflow or swipe navigation beyond the viewport width.

#### Scenario: Horizontal scroll is blocked on all screens
- **WHEN** user swipes left or right on any screen
- **THEN** no horizontal scroll or page shift occurs

#### Scenario: Overscroll navigation is disabled on Android Chrome
- **WHEN** user swipes horizontally beyond the viewport edge on Android Chrome
- **THEN** the page does not pull or navigate back/forward

### Requirement: Unintended overflow elements are clipped
All screen components SHALL be contained within the viewport width without causing horizontal scrollbars or invisible overflow.

#### Scenario: Glass panels do not overflow viewport
- **WHEN** a `.glass-panel` is rendered with any content
- **THEN** its width does not exceed the viewport width

#### Scenario: Long text does not cause overflow
- **WHEN** track titles or other text content exceed container width
- **THEN** text IS truncated with ellipsis rather than causing horizontal overflow

#### Scenario: Absolute/fixed positioned elements stay within bounds
- **WHEN** an element uses `position: absolute` or `position: fixed`
- **THEN** it does not extend beyond the viewport's right edge

### Requirement: Intentional horizontal scroll regions are preserved
Existing UI components with horizontal scroll behavior SHALL continue to function unchanged.

#### Scenario: Segmented control scrolls horizontally
- **WHEN** segmented options exceed container width
- **WHEN** user swipes horizontally on the segmented control
- **THEN** the segmented control scrolls its content
- **THEN** the rest of the page does not scroll horizontally

#### Scenario: Admin tabs scroll horizontally
- **WHEN** admin tabs exceed container width
- **WHEN** user swipes horizontally on the tab bar
- **THEN** the tab bar scrolls its content

#### Scenario: Category pills scroll horizontally
- **WHEN** category pills exceed container width on the Buy screen
- **WHEN** user swipes horizontally on the pill bar
- **THEN** the pill bar scrolls its content
