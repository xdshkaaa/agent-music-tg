## Context

Each track is rendered as a `.track-row` div with artwork, title/artist, a `TrackPlayButton` icon, and an optional external link. Currently only the icon button triggers playback — the row itself is inert. The app uses a shared React Context `PlayerProvider` with a `usePlayer()` hook exposing `toggle(track)`. Two screens show track lists: `ResultsScreen` (generated playlists) and `ProfileScreen` (download history).

## Goals / Non-Goals

**Goals:**
- Make clicking the `.track-row` area play/pause the track in both ResultsScreen and ProfileScreen
- Keep `TrackPlayButton` in ResultsScreen as a visible affordance (with `stopPropagation` to avoid double-toggle)
- Remove `CompactPlayButton` in ProfileScreen since the row becomes the tap target
- Add visual feedback (cursor, hover) to indicate rows are interactive

**Non-Goals:**
- Not changing PlayerScreen, PlayerBar, or any other component
- Not altering the player infrastructure or streaming
- Not changing bot-side code
- Not adding animations or redesigning the row layout

## Decisions

1. **ResultsScreen: onClick on `.track-row`, keep TrackPlayButton with stopPropagation**
   - `TrackPlayButton` already has an optional `stopPropagation` prop — just pass it
   - The button acts as a visual affordance; clicking anywhere works
   - Alternative considered: remove the button entirely — rejected because it signals playability at a glance

2. **ProfileScreen: remove CompactPlayButton, make `<li>` clickable**
   - `CompactPlayButton` is duplicated per track in the downloads expandable list
   - Since the entire row is now a tap target, the button is redundant and clutters the compact layout
   - The `<li>` gets `onClick` with `cursor: pointer` and the text gets a play/pause icon indicator

3. **CSS: minimal additions to `.track-row` and download `<li>`**
   - `cursor: pointer` and a subtle `:hover` background change
   - No structural changes to the flex layout
   - Match existing design tokens (hairline borders, card backgrounds)

## Risks / Trade-offs

- **Accidental play on scroll** → Mitigation: low risk since rows have `gap` between them and scroll containers are separate
- **Removing CompactPlayButton loses pause affordance** → Mitigation: the icon in ResultsScreen stays; user can pause by tapping again
