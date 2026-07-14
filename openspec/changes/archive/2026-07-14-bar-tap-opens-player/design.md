## Context

- App uses a custom React router in `App.tsx` (no react-router). Screens are switched via state.
- `PlayerProvider` wraps the app, exposing `usePlayer()` with `track`, `status`, `progress`, `volume`, `toggle`, `seek`, `setVolume`, `toggleMute`.
- `PlayerBar` in `PlayerBar.tsx` sits above the dock, visible when a track is loaded. It shows title, artist, progress bar, and play/pause.
- There is no full-screen player. No artwork support yet.
- The Liquid Glass UI design system uses `glass` class for translucency.

## Goals / Non-Goals

**Goals:**
- Tapping PlayerBar navigates to a full-screen `PlayerScreen`
- `PlayerScreen` shows: artwork area (placeholder gradient), track title, artist, progress slider, play/pause, volume slider, mute toggle
- Swipe-down or back button dismisses PlayerScreen
- Smooth slide-up/slide-down transition

**Non-Goals:**
- Adding real album artwork (out of scope — placeholder only)
- Playlist queue management
- Shuffle/repeat controls
- Lock screen / media session integration

## Decisions

- **No react-router dependency** — keep existing router pattern. PlayerScreen is a full-screen overlay rendered conditionally via a `showPlayer` state in a new `PlayerScreenProvider` (or inline in `App.tsx`). Avoids adding a dependency for one route.
- **Overlay not page navigation** — PlayerScreen overlays the current screen with a slide-up animation. This matches Telegram Mini App conventions where modals/overlays are preferred over page transitions.
- **Volume slider in PlayerScreen** — volume is already in `PlayerApi`. Adding a slider in the full-screen view puts it where users expect it without any server-side changes.
- **Artwork placeholder** — use a CSS gradient (`conic-gradient` or `radial-gradient`) as a placeholder. Avoids needing an artwork endpoint or CDN. Easy to swap for real art later.

## Risks / Trade-offs

- PlayerBar click might conflict with progress bar click on the right side → Mitigation: make the entire bar area clickable for navigation except the progress bar and play button (stopPropagation on those).
- Overlay approach means PlayerScreen doesn't have its own URL → users can't deep-link to the player. Acceptable for MVP; can be revisited.
- No artwork loading means the screen looks sparse → Add a large album-art-shaped gradient placeholder that fills the upper half.
