## ADDED Requirements

### Requirement: ResultsScreen download action is an icon-only button beside "Новый плейлист"
The download action in `ResultsScreen`'s action row SHALL render as a compact
icon-only button positioned in the same row as, and directly adjacent to, the
"Новый плейлист" button, for every `DownloadState` (`idle`, `sending`, `sent`,
`error`). It SHALL NOT render as a separate full-width labeled button.

#### Scenario: Idle state shows icon-only download button
- **WHEN** `download.kind` is `"idle"`
- **THEN** the action row SHALL show "Новый плейлист" followed by an icon-only
  button showing the download icon, with `aria-label="Скачать"`

#### Scenario: Sending state disables the icon button with a spinner
- **WHEN** `download.kind` is `"sending"`
- **THEN** the icon-only button SHALL be disabled and show a spinner icon with
  `aria-label="Отправляю в чат…"`

#### Scenario: Sent state shows a confirmation icon in the same slot
- **WHEN** `download.kind` is `"sent"`
- **THEN** the icon-only button SHALL show a checkmark icon with
  `aria-label="Отправлено в чат"`, and the action row SHALL NOT reflow or add a
  separate confirmation element in place of the button

#### Scenario: Action row does not wrap on narrow viewports
- **WHEN** the ResultsScreen is rendered at a narrow (e.g. 360px) viewport width
- **THEN** "Новый плейлист" and the icon-only download button SHALL remain on
  the same row without wrapping

### Requirement: Download error row is vertically aligned
The download-error row (icon, message, "Повторить" button) SHALL have its icon,
message text, and retry button vertically centered on a shared line regardless
of message length.

#### Scenario: Error icon and retry button share a center line
- **WHEN** `download.kind` is `"error"`
- **THEN** the `WarningCircle` icon, the error message, and the "Повторить"
  button SHALL be vertically centered relative to each other in the row

#### Scenario: Long error message does not compress the icon
- **WHEN** the error message text wraps to multiple lines
- **THEN** the `WarningCircle` icon SHALL retain its fixed size and not shrink
