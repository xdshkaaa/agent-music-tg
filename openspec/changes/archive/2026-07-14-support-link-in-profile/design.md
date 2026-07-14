## Context

The bot already has a `support_contact` setting stored in the `settings` table and editable from the admin panel. A `/support` command reads and displays this value. The `/profile` command shows user stats (credits, subscription, purchases) but does not display support info. The `/start` welcome message includes a static "Поддержка 24/7" bullet that references support regardless of whether a contact is configured.

## Goals / Non-Goals

**Goals:**
- Display support contact on the `/profile` page when configured
- Remove the static "Поддержка 24/7" bullet from `/start`
- Preserve existing admin panel's ability to set `support_contact`

**Non-Goals:**
- No changes to the `/support` command behavior
- No new database fields or settings
- No ticketing system or chat forwarding
- No changes to the Mini App or API layer

## Decisions

- **Reuse existing `support_contact` setting** — No new DB fields needed. The setting is already read via `getShopSettings(db)` and used by the admin panel.
- **Append to profile as additional line** — The `/profile` handler in `shop.ts` builds an array of lines. Adding a conditional line for support contact is the least invasive approach.
- **Conditional display** — Only show the support line if `shop.supportContact` is non-empty. If unset, no support section appears in the profile.
- **Static bullet removed from `/start`** — The array `["• Сгенерируй плейлист", "• Купи доступ", "• Поддержка 24/7"]` in `bot/index.ts` will have the third element removed.

## Risks / Trade-offs

- **Existing users may not notice** — Moving support from `/start` to `/profile` means users checking `/start` won't see the support reminder. Mitigation: `/profile` is already a discoverable command in the menu.
- **Empty contact renders nothing** — If admin hasn't configured `support_contact`, no support section appears. This is consistent with current `/support` command behavior ("Контакт поддержки не указан.").
