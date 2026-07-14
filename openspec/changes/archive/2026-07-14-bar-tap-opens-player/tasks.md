## 1. PlayerBar — make it tappable

- [x] 1.1 Wrap PlayerBar in a clickable overlay div; progress bar and play button call `stopPropagation` to prevent navigation
- [x] 1.2 Add `onClick` prop or state callback to navigate to PlayerScreen from App.tsx

## 2. PlayerScreen component

- [x] 2.1 Create `miniapp/src/screens/PlayerScreen.tsx` — full-screen overlay with slide-up/down animation
- [x] 2.2 Add artwork placeholder (gradient), track title, artist, play/pause, progress bar, volume slider, mute toggle
- [x] 2.3 Wire controls to `usePlayer()` API (toggle, seek, setVolume, toggleMute)
- [x] 2.4 Add back button to dismiss PlayerScreen; support swipe-down gesture

## 3. Wire into App.tsx

- [x] 3.1 Import PlayerScreen and render it as a conditional overlay (above the dock) when a `showPlayer` state is true
- [x] 3.2 Pass `onOpenPlayer` callback down to PlayerBar
- [x] 3.3 Pass `onClosePlayer` callback down to PlayerScreen

## 4. Styles

- [x] 4.1 Add PlayerScreen styles to `miniapp/src/styles/glass.css` (full-screen overlay, slide animation, volume slider, layout)
