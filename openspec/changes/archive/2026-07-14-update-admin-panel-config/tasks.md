## 1. Server — Settings & Access Layer

- [x] 1.1 Extend `server/lib/settings.ts` — add `getProviderConfig`, `setProviderConfig`, `getPaymentsEnabled`, `setPaymentsEnabled`, `getAllSettings`, `setSettingByKey`, `deleteSettingByKey`
- [x] 1.2 Extend `server/lib/access-control.ts` — add `addToAllowlist`, `removeFromAllowlist`, `getAllowlist`, `setChatAdminRole`
- [x] 1.3 Update `bootstrapAllowlist` in `access-control.ts` to use `INSERT OR IGNORE` (don't overwrite runtime changes)

## 2. Server — Agent Registry Provider Config Merge

- [x] 2.1 Export `getProviderDefaults` from `server/agent/registry.ts` — returns env-based config per provider
- [x] 2.2 Update `createProvider` in registry to merge DB overrides from settings into env defaults (model, baseUrl)

## 3. Server — New Admin API Endpoints

- [x] 3.1 Add `GET /api/admin/users` — list all users
- [x] 3.2 Add `POST /api/admin/users/:chatId/credits` — grant/deduct credits
- [x] 3.3 Add `POST /api/admin/users/:chatId/subscription` — extend subscription
- [x] 3.4 Add `GET /api/admin/access` + `POST /api/admin/access/add` + `POST /api/admin/access/remove` + `POST /api/admin/access/set-role` — allowlist & admin management
- [x] 3.5 Add `GET /api/admin/provider-config` + `POST /api/admin/provider-config/:id` — provider config view/edit
- [x] 3.6 Add `GET /api/admin/all-settings` + `POST /api/admin/all-settings` + `POST /api/admin/all-settings/:key` — unified settings editor
- [x] 3.7 Add `GET /api/admin/payments-config` + `POST /api/admin/payments-config` — payments toggle
- [x] 3.8 Update invoice creation (`/api/invoices`) to check runtime `paymentsEnabled`

## 4. Mini App — API Client

- [x] 4.1 Add new API methods to `miniapp/src/lib/api.ts` — users, access, provider-config, all-settings, payments-config

## 5. Mini App — Admin Screen

- [x] 5.1 Restructure AdminScreen with tab-based navigation — sections: Stats, Offers, Users, Access, Providers, Settings, Payments, Broadcast, Shop
- [x] 5.2 Create UsersPanel — list users, grant/deduct credits, extend subscription
- [x] 5.3 Create AccessPanel — add/remove allowlist entries, promote/demote admin
- [x] 5.4 Create ProviderConfigPanel — view/edit per-provider model and base URL
- [x] 5.5 Create UnifiedSettingsPanel — view and edit all key-value settings
- [x] 5.6 Create PaymentsPanel — toggle payments on/off, show current status

## 6. Bot — Admin Panel Parity

- [x] 6.1 Add bot FSM handlers for new admin features: user management, access control, provider config, payments toggle
- [x] 6.2 Add `/admin` menu buttons for new sections
