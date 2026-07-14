## 1. ResultsScreen: make track row clickable

- [x] 1.1 Import `usePlayer` from `../lib/player` in ResultsScreen.tsx
- [x] 1.2 Add `const player = usePlayer()` inside the component body
- [x] 1.3 Add `onClick={() => player.toggle({ uri: track.uri, title: track.title, artist: track.artist })}` to the `.track-row` div
- [x] 1.4 Pass `stopPropagation` prop to `<TrackPlayButton>` to prevent double-fire on button click

## 2. ProfileScreen: replace CompactPlayButton with clickable row

- [x] 2.1 Remove `CompactPlayButton` component and its usage in ProfileScreen.tsx
- [x] 2.2 Add `onClick` to each download track `<li>` that calls `player.toggle(track)`
- [x] 2.3 Add cursor pointer and hover styling to the `<li>` via inline styles or a CSS class

## 3. CSS: visual feedback for clickable rows

- [x] 3.1 Add `cursor: pointer` and a `:hover` background effect to `.track-row` in glass.css
- [x] 3.2 Verify the active/press state provides visual feedback
