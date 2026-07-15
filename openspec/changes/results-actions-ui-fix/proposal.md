## Why

ResultsScreen action row is broken: "Скачать" renders as a second full-width primary
pill button stacked/wrapped under "Новый плейлист", duplicating visual weight and
pushing content around on small viewports. The download-error state (`!` icon +
message + "Повторить") also has cramped, mismatched vertical alignment against the
`WarningCircle` icon. Fix both so the action row is one aligned row with download as
a compact icon-only button next to "Новый плейлист", and the error retry row is
properly aligned.

## What Changes

- Replace the full-width "Скачать" primary button with an icon-only circular/square
  icon button placed directly to the right of "Новый плейлист" in the same row.
- Icon button shows `DownloadSimple` normally, a spinner while sending, and a
  checkmark (or brief inline confirmation) once sent — no label text.
- Add an accessible label (`aria-label="Скачать"` / `"Отправляю в чат…"` /
  `"Отправлено в чат"`) since the label text is removed visually.
- Fix vertical alignment of the download-error row (`WarningCircle` icon vs message
  text vs "Повторить" button) so all three sit on the same center line.
- No change to download request/polling logic, only presentation of the
  trigger button and error row.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `screen-refinement`: ResultsScreen action row layout changes — download action
  becomes an icon-only button beside "Новый плейлист" instead of a separate
  full-width primary button, and the error-retry row alignment is corrected.

## Impact

- `miniapp/src/screens/ResultsScreen.tsx` — action row markup/handlers.
- `miniapp/src/styles/glass.css` — new icon-button style variant, error-row
  alignment fix.
