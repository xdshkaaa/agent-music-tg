## Context

`ResultsScreen.tsx` renders a `.row.wrap` containing "Новый плейлист" (`.glass-button`)
and, depending on `download.kind`, either "Скачать" (`.glass-button.primary`, full
label), a "sent" confirmation pill, or (during `sending`) a loading label. On narrow
viewports the two full-width buttons wrap onto separate lines, doubling the visual
weight of the action row. Separately, the error row (`download.kind === "error"`)
places a `WarningCircle` icon, message text, and "Повторить" button in one flex row
without shared baseline alignment, so the icon/text/button don't line up.

## Goals / Non-Goals

**Goals:**
- Download action becomes a compact icon-only button sitting beside "Новый
  плейлист" in one row, at every `download.kind` state (idle/sending/sent/error).
- Icon button keeps full accessibility (aria-label per state, disabled while sending).
- Error-retry row: icon, message, and button vertically centered on one line.

**Non-Goals:**
- No change to the download/polling API calls or `DownloadState` transitions.
- No redesign of the "sent" confirmation pill's copy or the toast component.

## Decisions

- **Icon-only button, not a smaller labeled button**: matches the explicit ask
  ("сделаем как иконку") and removes the duplicate-primary-button visual weight.
  Reuses the existing `.glass-button` / `.glass-button.primary` classes with a
  new `.icon-only` modifier (square aspect, fixed width = height, no gap) rather
  than inventing a new component — keeps existing glass/hover/focus styling.
- **"Sent" state**: instead of swapping the whole button for a separate `<p>`
  confirmation pill, the icon button flips to a checkmark icon briefly disabled
  (still icon-only, still in the same slot) so the row never reflows. Rationale:
  keeps the two-button row at a constant width instead of one button being
  replaced by a wider pill.
- **Error row alignment**: wrap the icon and message text in a flex container with
  `align-items: center` explicitly (not relying on default `flex-start` from
  `wrap` combined with mismatched line-heights), and give the icon a fixed
  `flex-shrink: 0` box so long error messages don't compress it.

## Risks / Trade-offs

- [Risk] Icon-only button loses the discoverability of the word "Скачать" for
  first-time users → Mitigation: `title` attribute (native tooltip) plus
  `aria-label` retains discoverability for hover/screen readers; icon
  (`DownloadSimple`) is already used elsewhere in-app with the same meaning.
- [Risk] Checkmark-in-button "sent" state is less prominent than the previous
  full-width pill → Mitigation: out of scope per proposal; can be revisited if
  user feedback says confirmation is missed.

## Migration Plan

Pure frontend presentational change, no data migration. Ship via normal
`bun run build:miniapp` + `deploy.sh` cycle.
