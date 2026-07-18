# payments (delta)

## ADDED Requirements

### Requirement: Telegram Stars purchase for playlist slots
The system SHALL sell extra playlist slots via Telegram Stars (XTR) invoices sent through the bot. The bot SHALL answer `pre_checkout_query` and grant slots on `successful_payment`, idempotently per payment charge id. Slot balances SHALL persist per user.

#### Scenario: Successful Stars purchase
- **WHEN** user pays a Stars invoice for extra playlist slots
- **THEN** the slot balance increases by the purchased amount and the Mini App reflects the new limit

#### Scenario: Duplicate payment event
- **WHEN** the same successful_payment is processed twice
- **THEN** slots are granted exactly once

#### Scenario: Purchase entry point from limit prompt
- **WHEN** user hits the playlist limit in the Mini App and confirms purchase
- **THEN** a Stars invoice is issued (invoice link opened in the Mini App or sent to the bot chat)
