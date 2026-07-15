## 1. Styles

- [x] 1.1 Add `.glass-button.icon-only` modifier in `miniapp/src/styles/glass.css`
      (square box, no text gap, keeps existing glass/hover/focus/primary variants)
- [x] 1.2 Add/fix error-row alignment styles so icon, message, and retry button
      share a vertical center line, with the icon `flex-shrink: 0`

## 2. ResultsScreen action row

- [x] 2.1 Replace the full-width "Скачать" button with an icon-only button
      rendered in the same row as "Новый плейлист" (`DownloadSimple` icon,
      `aria-label="Скачать"`, `title="Скачать"`)
- [x] 2.2 Sending state: icon-only button disabled, shows spinner icon,
      `aria-label="Отправляю в чат…"`
- [x] 2.3 Sent state: icon-only button shows checkmark icon in the same slot,
      `aria-label="Отправлено в чат"`, remove the separate confirmation `<p>` pill
- [x] 2.4 Verify the action row (both buttons) does not wrap at 360px viewport width

## 3. Error row fix

- [x] 3.1 Apply the new alignment styles to the `download.kind === "error"` row
      so `WarningCircle`, message, and "Повторить" line up
- [x] 3.2 Confirm long/wrapped error messages don't compress the icon

## 4. Verification

- [x] 4.1 `bun run typecheck`
- [ ] 4.2 Manually exercise idle → sending → sent and idle → sending → error →
      retry flows in the Mini App (or dev server) and confirm layout/aria-labels
