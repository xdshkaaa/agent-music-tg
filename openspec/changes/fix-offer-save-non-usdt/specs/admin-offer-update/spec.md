## ADDED Requirements

### Requirement: Admin can partially update an offer
The system SHALL allow admins to update offers via PATCH without supplying every field. Fields omitted from the request body SHALL retain their existing values. In particular, `starsAmount` MAY be omitted, `null`, or `0` — the endpoint SHALL NOT reject the request solely because `starsAmount` is missing or zero.

#### Scenario: Update asset only, keep existing starsAmount
- **WHEN** an admin sends PATCH to `/admin/offers/:id` with only `{ asset: "TON" }` for an offer that has `starsAmount: null`
- **THEN** the server SHALL respond with 200 and the offer's `starsAmount` SHALL remain `null`

#### Scenario: Clear starsAmount to null
- **WHEN** an admin sends PATCH with `{ starsAmount: null }`
- **THEN** the server SHALL accept the request and set `starsAmount` to `null`

#### Scenario: Set starsAmount to zero is accepted
- **WHEN** an admin sends PATCH with `{ starsAmount: 0 }`
- **THEN** the server SHALL respond with 200 (the store layer may treat it as "clear to null" or accept zero)

#### Scenario: Invalid starsAmount values still rejected
- **WHEN** an admin sends PATCH with `{ starsAmount: -5 }` or `{ starsAmount: "abc" }`
- **THEN** the server SHALL respond with 400
