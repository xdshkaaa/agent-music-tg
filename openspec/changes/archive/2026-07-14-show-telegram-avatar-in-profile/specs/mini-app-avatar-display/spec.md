## ADDED Requirements

### Requirement: Display Telegram profile photo
The Mini App ProfileScreen SHALL display the user's Telegram profile photo when available.

#### Scenario: Photo available
- **WHEN** `me.photoUrl` is not null
- **THEN** ProfileScreen SHALL render an `<img>` element with `src` set to `me.photoUrl`
- **THEN** the image SHALL be displayed as a 52px circle (`border-radius: 50%`, `object-fit: cover`)

#### Scenario: Photo not available
- **WHEN** `me.photoUrl` is null
- **THEN** ProfileScreen SHALL render a fallback placeholder (Phosphor `User` icon or initials)

### Requirement: Photo URL from API
The Mini App SHALL receive the photo URL via the `/api/me` endpoint.

#### Scenario: Photo URL present
- **WHEN** `GET /api/me` is called
- **WHEN** the user has a stored `photo_file_id`
- **THEN** the response SHALL include `photoUrl` with the full Telegram CDN URL

#### Scenario: Photo URL absent
- **WHEN** `GET /api/me` is called
- **WHEN** the user has no stored `photo_file_id`
- **THEN** the response SHALL include `photoUrl: null`
