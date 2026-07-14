# admin-panel — delta

## ADDED Requirements

### Requirement: Admin can manage the Stars price of an offer
Offer create/edit in the admin surfaces (Mini App AdminScreen and bot admin panel) SHALL accept an optional Stars price. Clearing the field SHALL make the offer crypto-only again. The offers list SHALL display the Stars price when set.

#### Scenario: Admin sets a Stars price
- **WHEN** an admin edits an offer and enters a positive integer Stars price
- **THEN** the offer becomes purchasable with Stars at that price alongside crypto

#### Scenario: Admin clears the Stars price
- **WHEN** an admin clears the Stars price on a dual-price offer
- **THEN** subsequent purchases offer only the crypto method

#### Scenario: Invalid Stars price rejected
- **WHEN** an admin submits a zero, negative, or non-integer Stars price
- **THEN** the change is rejected with a validation error and the offer is unchanged
