## 1. DB migration

- [x] 1.1 Add `photo_file_id TEXT` column to `users` table in `server/db.ts`
- [x] 1.2 Update `server/access/users-store.ts` with getter/setter for `photo_file_id`

## 2. Telegram avatar fetch (capability: telegram-avatar-fetch)

- [x] 2.1 In `server/bot/index.ts` `/start` handler, call `getUserProfilePhotos(chatId, { limit: 1 })`
- [x] 2.2 Select the largest photo (last element in the first photos array)
- [x] 2.3 Store `file_id` via `setPhotoFileId(db, chatId, fileId)`
- [x] 2.4 Handle empty result (no photo) gracefully

## 3. API extension (capability: user-profile-api)

- [x] 3.1 In `/api/me` handler, when `photo_file_id` is present, construct URL via `getFile` and return `photoUrl`
- [x] 3.2 Update `MeResponse` type in `miniapp/src/lib/api.ts`

## 4. Mini App avatar display (capability: mini-app-avatar-display)

- [x] 4.1 Replace decorative dot placeholder with `<img>` displaying `me.photoUrl`
- [x] 4.2 Style as 52px circle with `object-fit: cover`
- [x] 4.3 Fallback when `photoUrl` is null: show Phosphor `User` icon

## 5. Bot avatar display (capability: bot-avatar-display)

- [x] 5.1 In `/profile` handler, send photo via `ctx.replyWithPhoto(fileId, { caption })` when photo exists
- [x] 5.2 Keep plain-text fallback when no photo

## 6. Verification

- [x] 6.1 `bun run typecheck` passes (2 pre-existing errors in admin-panel.ts unrelated to this change)
- [x] 6.2 `cd miniapp && bun run build` succeeds
- [x] 6.3 `bun test` passes (35/35)
