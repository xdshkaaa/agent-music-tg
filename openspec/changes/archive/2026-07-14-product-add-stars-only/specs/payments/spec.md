# payments — delta

## MODIFIED Requirements

### Requirement: Offer supports required Telegram Stars price

An offer SHALL have a required Stars price (`stars_amount`, positive integer). The `createOffer` function SHALL reject input where `stars_amount` is null or undefined. The `updateOffer` function SHALL require a valid positive integer `stars_amount`. Existing offers with NULL `stars_amount` in the database SHALL remain purchasable via crypto only (grandfathered).

#### Scenario: New offer requires Stars price

- **WHEN** admin creates a new offer without providing a Stars price
- **THEN** the creation is rejected with a validation error and no offer is stored

#### Scenario: New offer with valid Stars price

- **WHEN** admin creates a new offer with a valid positive integer Stars price
- **THEN** the offer is created and purchasable via both Stars and crypto

#### Scenario: Invalid Stars price on new offer

- **WHEN** admin submits a zero, negative, or non-integer Stars price on a new offer
- **THEN** the creation is rejected with a validation error

#### Scenario: Update requires Stars price

- **WHEN** admin updates an existing offer (including a grandfathered NULL-stars offer) with a null or missing Stars price
- **THEN** the update is rejected with a validation error

#### Scenario: Update with valid Stars price

- **WHEN** admin updates an offer with a valid positive integer Stars price
- **THEN** the update succeeds

#### Scenario: Grandfathered offer still purchasable via crypto

- **WHEN** a buyer purchases an existing offer whose `stars_amount` is NULL in the database
- **THEN** the crypto-only flow proceeds as before, no Stars option is presented

## REMOVED Requirements

### Requirement: Offer supports optional Telegram Stars price

**Reason**: Stars price is now required for all new offers.
**Migration**: Existing crypto-only offers with NULL `stars_amount` are grandfathered and remain purchasable. Admin should update them to include a Stars price.
