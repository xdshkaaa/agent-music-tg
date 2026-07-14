## ADDED Requirements

### Requirement: photoUrl field in /api/me
The `/api/me` endpoint SHALL return an optional `photoUrl` field.

#### Scenario: photoUrl present
- **WHEN** `GET /api/me` is called
- **WHEN** the user has a stored `photo_file_id`
- **THEN** the response body SHALL contain `"photoUrl": "https://api.telegram.org/file/bot<token>/<path>"`
- **THEN** the existing fields (`chatId`, `isAdmin`, `credits`, `subscriptionUntil`) SHALL remain unchanged

#### Scenario: photoUrl null
- **WHEN** `GET /api/me` is called
- **WHEN** the user has no stored `photo_file_id`
- **THEN** the response body SHALL contain `"photoUrl": null`
