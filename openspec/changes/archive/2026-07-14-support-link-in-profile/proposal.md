## Why

Support contact is currently only accessible via the `/support` command and briefly mentioned in `/start` welcome message. Users looking at their profile have no way to see or reach support. Moving the support link to the profile makes it discoverable when users need it, while cleaning up the main menu and `/start` from redundant support references.

## What Changes

- Add support contact info to the `/profile` page (displayed if configured)
- Remove the "Поддержка 24/7" bullet from `/start` welcome message
- Support contact remains configurable via admin panel (`support_contact` setting — already exists)
- The `/support` command stays registered but is no longer promoted from `/start`

## Capabilities

### New Capabilities
- `support-link-profile`: Show configurable support contact info on the user's profile page

### Modified Capabilities

None — no existing specs in `openspec/specs/`.

## Impact

- **bot/shop.ts** — `/profile` handler: add support contact line if configured
- **bot/index.ts** — `/start` handler: remove "Поддержка 24/7" bullet
- **lib/settings.ts** — no changes needed (support_contact already exists and is admin-configurable)
- **bot/admin-panel.ts** — no changes needed (support editing already works)
