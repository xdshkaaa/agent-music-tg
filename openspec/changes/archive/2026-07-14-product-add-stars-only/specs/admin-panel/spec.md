# admin-panel — delta

## MODIFIED Requirements

### Requirement: Admin must provide a Stars price when creating or editing an offer

Offer create and edit in the admin surfaces SHALL require a valid positive integer Stars price. The bot FSM for new offers SHALL NOT offer a "skip" path for the Stars price step — the admin MUST enter a positive integer. The Mini App `OfferForm` SHALL mark the Stars price field as required and validate it before submission. PATCH requests to existing offers SHALL require setting a non-null `stars_amount`.

#### Scenario: Bot FSM requires Stars price for new offer

- **WHEN** an admin creates a new offer via the bot FSM and reaches the Stars price step
- **THEN** the input `-` (skip) is NOT accepted; only a positive integer is accepted as valid input

#### Scenario: Bot FSM rejects empty Stars price

- **WHEN** an admin sends empty text or `-` at the Stars price step
- **THEN** the bot replies with a validation error and stays on the same step

#### Scenario: Mini App form requires Stars price on create

- **WHEN** an admin opens the new offer form in the Mini App
- **THEN** the Stars price input is marked as required and the submit button is disabled until a value is entered

#### Scenario: Mini App form validates Stars price on create

- **WHEN** an admin submits a new offer with an invalid or empty Stars price in the Mini App
- **THEN** the form shows a validation error and the offer is not created

#### Scenario: Mini App form requires Stars price on edit

- **WHEN** an admin edits an existing offer (including grandfathered NULL-stars offers) in the Mini App
- **THEN** the Stars price field is required and the form cannot be submitted without a valid positive integer value

## REMOVED Requirements

### Requirement: Admin can manage the Stars price of an offer

**Reason**: Stars price is no longer optional; it is required for all offers.
**Migration**: The admin forms now require a Stars price when creating or updating offers. Existing NULL-stars offers are grandfathered but require a Stars price when edited.
